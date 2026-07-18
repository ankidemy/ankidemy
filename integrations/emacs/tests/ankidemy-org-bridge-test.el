;;; ankidemy-org-bridge-test.el --- Tests for local bridge -*- lexical-binding: t; -*-

(require 'ert)
(require 'cl-lib)
(require 'org)
(require 'ankidemy-org-bridge)

(defvar org-roam-directory nil)

(defmacro ankidemy-org-bridge-test--with-root (&rest body)
  "Create a small manifested root and run BODY in it."
  `(let* ((root (file-name-as-directory
                 (make-temp-file "ankidemy-bridge-root-" t)))
          (org-roam-directory root)
          (ankidemy-org-bridge--cache nil))
     (unwind-protect
         (progn
           (with-temp-file (expand-file-name "ankidemy.org" root)
             (insert "#+title: Bridge fixture\n"
                     "#+ankidemy_notebook_id: bridge-notebook\n"
                     "#+ankidemy_schema: 1\n"))
           (with-temp-file (expand-file-name "node.org" root)
             (insert ":PROPERTIES:\n:ID: bridge-node\n:END:\n"
                     "#+title: Card\n\n"
                     "[[file:pixel.png]]\n"))
           (with-temp-file (expand-file-name "pixel.png" root)
             (set-buffer-multibyte nil)
             (insert (base64-decode-string
                      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")))
           ,@body)
       (delete-directory root t))))

(ert-deftest ankidemy-org-bridge-reuses-snapshot-until-input-changes ()
  (ankidemy-org-bridge-test--with-root
   (let ((calls 0)
         (original (symbol-function 'ankidemy-org-snapshot-json)))
     (cl-letf (((symbol-function 'ankidemy-org-snapshot-json)
                (lambda (requested)
                  (setq calls (1+ calls))
                  (funcall original requested))))
       (ankidemy-org-bridge--snapshot root)
       (ankidemy-org-bridge--snapshot root)
       (should (= calls 1))
       (with-temp-buffer
         (insert-file-contents (expand-file-name "node.org" root))
         (goto-char (point-max))
         (insert "Changed.\n")
         (write-region (point-min) (point-max)
                       (expand-file-name "node.org" root) nil 'silent))
       (ankidemy-org-bridge--snapshot root)
       (should (= calls 2))))))

(ert-deftest ankidemy-org-bridge-serves-only-snapshot-owned-assets ()
  (ankidemy-org-bridge-test--with-root
   (let* ((snapshot (ankidemy-org-bridge--snapshot root))
          (id (alist-get 'id (aref (alist-get 'assets snapshot) 0)))
          (asset (ankidemy-org-bridge--asset root id)))
     (should (equal id (alist-get 'sha256 asset)))
     (should (equal "image/png" (alist-get 'mime asset)))
     (should (= (alist-get 'size asset)
                (length (base64-decode-string (alist-get 'base64 asset)))))
     (should-error (ankidemy-org-bridge--asset
                    root (concat "sha256:" (make-string 64 ?0)))))))

(ert-deftest ankidemy-org-bridge-snapshot-remains-json-serializable-with-nodes ()
  (ankidemy-org-bridge-test--with-root
   (let* ((snapshot (ankidemy-org-bridge--snapshot root))
          (nodes (alist-get 'nodes snapshot))
          (wire (json-serialize
                 `((type . "response") (id . "snapshot-test")
                   (ok . t) (result . ,snapshot))
                 :null-object nil :false-object :json-false)))
     (should (vectorp nodes))
     (should (> (length nodes) 0))
     (should (string-match-p
              (regexp-quote "\"sourceId\":\"bridge-node\"") wire)))))

(ert-deftest ankidemy-org-bridge-authenticates-before-root-disclosure ()
  (ankidemy-org-bridge-test--with-root
   (let ((ankidemy-org-bridge-token "shared-secret")
         (ankidemy-org-bridge--instance-id "test-instance")
         (websocket (list 'fake-websocket))
         sent closed)
     (cl-letf (((symbol-function 'ankidemy-org-bridge--json-send)
                (lambda (_ws value) (push value sent)))
               ((symbol-function 'websocket-close)
                (lambda (_ws) (setq closed t))))
       (ankidemy-org-bridge--authenticate
        websocket '((token . "wrong")))
       (should closed)
       (should-not (gethash websocket ankidemy-org-bridge--authenticated))
       (setq sent nil closed nil)
       (ankidemy-org-bridge--authenticate
        websocket '((token . "shared-secret")))
       (should-not closed)
       (should (gethash websocket ankidemy-org-bridge--authenticated))
       (should (= (length sent) 2))
       (remhash websocket ankidemy-org-bridge--authenticated)))))

(ert-deftest ankidemy-org-bridge-mode-rejects-short-token ()
  (let ((ankidemy-org-bridge-mode nil)
        (ankidemy-org-bridge-token "too-short")
        (ankidemy-org-bridge-host "127.0.0.1"))
    (should-error (ankidemy-org-bridge-mode 1) :type 'user-error)
    (should-not ankidemy-org-bridge-mode)))

(ert-deftest ankidemy-org-bridge-suspends-and-redacts-unmanifested-active-root ()
  (let* ((private (file-name-as-directory
                   (make-temp-file "ankidemy-private-root-" t)))
         (org-roam-directory private)
         (ankidemy-org-bridge-mode t)
         (ankidemy-org-bridge--save-timer 'save-timer)
         (ankidemy-org-bridge--presence-timer 'presence-timer)
         (ankidemy-org-bridge--clients '(fake-client))
         (ankidemy-org-bridge--authenticated (make-hash-table :test #'eq))
         cancelled idle-scheduled sent)
    (unwind-protect
        (cl-letf (((symbol-function 'cancel-timer)
                   (lambda (timer) (push timer cancelled)))
                  ((symbol-function 'run-at-time)
                   (lambda (_delay _repeat callback &rest args)
                     (apply callback args)
                     'new-timer))
                  ((symbol-function 'run-with-idle-timer)
                   (lambda (&rest _args) (setq idle-scheduled t) 'new-idle-timer))
                  ((symbol-function 'ankidemy-org-bridge--json-send)
                   (lambda (_websocket value) (push value sent))))
          (puthash 'fake-client t ankidemy-org-bridge--authenticated)
          (should-not (ankidemy-org-bridge--active-approved-root))
          (let ((info (ankidemy-org-bridge--root-info)))
            (should (equal "" (alist-get 'root info)))
            (should (eq :json-false (alist-get 'hasManifest info))))
          (ankidemy-org-bridge--notify "presence.changed" '((sourceId . "secret")))
          (ankidemy-org-bridge--schedule-snapshot-change)
          (ankidemy-org-bridge--queue-presence)
          (ankidemy-org-bridge--poll-filesystem)
          (should-not sent)
          (should-not idle-scheduled)
          (setq ankidemy-org-bridge--save-timer 'save-timer
                ankidemy-org-bridge--presence-timer 'presence-timer)
          (ankidemy-org-bridge--root-watcher
           'org-roam-directory private 'set nil)
          (should (memq 'save-timer cancelled))
          (should (memq 'presence-timer cancelled))
          (should (= 1 (length sent)))
          (let ((reported (alist-get 'root (alist-get 'params (car sent)))))
            (should (equal "" (alist-get 'root reported)))
            (should (eq :json-false (alist-get 'hasManifest reported)))))
      (delete-directory private t))))

(ert-deftest ankidemy-org-bridge-auth-and-health-do-not-read-unmanifested-root ()
  (let* ((private (file-name-as-directory
                   (make-temp-file "ankidemy-private-root-" t)))
         (org-roam-directory private)
         (org-roam-db-location "/private/org-roam.db")
         (ankidemy-org-bridge-token "shared-secret")
         (ankidemy-org-bridge--instance-id "test-instance")
         (ankidemy-org-bridge--authenticated (make-hash-table :test #'eq))
         (ankidemy-org-bridge--auth-timers (make-hash-table :test #'eq))
         sent health signature-called)
    (unwind-protect
        (cl-letf (((symbol-function 'ankidemy-org-bridge--json-send)
                   (lambda (_websocket value) (push value sent)))
                  ((symbol-function 'ankidemy-org-bridge--response)
                   (lambda (_websocket _id result) (setq health result)))
                  ((symbol-function 'ankidemy-org-bridge--signature)
                   (lambda (_root) (setq signature-called t) "forbidden")))
          (ankidemy-org-bridge--authenticate
           'fake-websocket '((token . "shared-secret")))
          (should (= 2 (length sent)))
          (should (string= "root.changed" (alist-get 'type (car sent))))
          (should (string= "authenticated" (alist-get 'type (cadr sent))))
          (ankidemy-org-bridge--dispatch-request
           'fake-websocket '((id . "health") (method . "health.get")))
          (should (equal "" (alist-get 'currentDb health)))
          (should-not (alist-get 'sourceRevision health))
          (should-not signature-called)
          (should (equal "" (alist-get 'root (alist-get 'root health))))
          (should-error (ankidemy-org-bridge--snapshot private)))
      (delete-directory private t))))

(ert-deftest ankidemy-org-bridge-manifest-poll-grants-and-revokes-access ()
  (let* ((root (file-name-as-directory
                (make-temp-file "ankidemy-manifest-poll-" t)))
         (org-roam-directory root)
         (ankidemy-org-bridge-mode t)
         (ankidemy-org-bridge--clients '(fake-client))
         (ankidemy-org-bridge--authenticated (make-hash-table :test #'eq))
         (ankidemy-org-bridge--last-manifest-state
          (ankidemy-org-bridge--manifest-state))
         sent)
    (unwind-protect
        (cl-letf (((symbol-function 'ankidemy-org-bridge--json-send)
                   (lambda (_websocket value) (push value sent)))
                  ((symbol-function 'ankidemy-org-bridge--schedule-snapshot-change)
                   #'ignore))
          (puthash 'fake-client t ankidemy-org-bridge--authenticated)
          (with-temp-file (expand-file-name "ankidemy.org" root)
            (insert "#+title: Newly approved\n"
                    "#+ankidemy_notebook_id: newly-approved\n"
                    "#+ankidemy_schema: 1\n"))
          (ankidemy-org-bridge--poll-manifest)
          (let ((reported (alist-get 'root (alist-get 'params (car sent)))))
            (should (eq t (alist-get 'hasManifest reported)))
            (should (equal "newly-approved"
                           (alist-get 'providerNotebookId reported))))
          (delete-file (expand-file-name "ankidemy.org" root))
          (ankidemy-org-bridge--poll-manifest)
          (let ((reported (alist-get 'root (alist-get 'params (car sent)))))
            (should (eq :json-false (alist-get 'hasManifest reported)))
            (should (equal "" (alist-get 'root reported)))))
      (delete-directory root t))))

(ert-deftest ankidemy-org-bridge-closed-socket-race-is-silent ()
  (cl-letf (((symbol-function 'websocket-ready-state) (lambda (_websocket) 'open))
            ((symbol-function 'websocket-send-text)
             (lambda (&rest _args) (error "socket closed during send"))))
    (should-not (ankidemy-org-bridge--json-send
                 'fake-websocket '((type . "presence.changed"))))))

(ert-deftest ankidemy-org-bridge-mode-starts-and-cleans-up ()
  (let ((ankidemy-org-bridge-mode nil)
        (ankidemy-org-bridge-token (make-string 24 ?x))
        (ankidemy-org-bridge-host "127.0.0.1")
        (ankidemy-org-bridge--server nil)
        (ankidemy-org-bridge--filesystem-timer nil)
        (original-require (symbol-function 'require))
        started stopped timer-cancelled)
    (cl-letf (((symbol-function 'require)
               (lambda (feature &optional filename noerror)
                 (if (eq feature 'websocket)
                     t
                   (funcall original-require feature filename noerror))))
              ((symbol-function 'websocket-server)
               (lambda (&rest _args)
                 (setq started t)
                 'fake-server))
              ((symbol-function 'websocket-server-close)
               (lambda (server)
                 (should (eq server 'fake-server))
                 (setq stopped t)))
              ((symbol-function 'run-at-time)
               (lambda (&rest _args) 'fake-timer))
              ((symbol-function 'cancel-timer)
               (lambda (timer)
                 (should (eq timer 'fake-timer))
                 (setq timer-cancelled t))))
      (unwind-protect
          (progn
            (ankidemy-org-bridge-mode 1)
            (should ankidemy-org-bridge-mode)
            (should started)
            (should (eq ankidemy-org-bridge--server 'fake-server)))
        (ankidemy-org-bridge-mode -1))
      (should stopped)
      (should timer-cancelled)
      (should-not ankidemy-org-bridge--server)
      (should-not (memq #'ankidemy-org-bridge--after-save after-save-hook))
      (should-not (memq #'ankidemy-org-bridge--queue-presence
                        post-command-hook)))))

(provide 'ankidemy-org-bridge-test)
;;; ankidemy-org-bridge-test.el ends here
