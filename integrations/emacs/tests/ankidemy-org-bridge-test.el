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

(ert-deftest ankidemy-org-bridge-allowlist-is-a-symlink-safe-boundary ()
  (let* ((allowed (file-name-as-directory
                   (make-temp-file "ankidemy-allowed-root-" t)))
         (child (expand-file-name "Algorithms" allowed))
         (sibling (make-temp-file "ankidemy-disallowed-root-" t))
         (ankidemy-org-bridge-allowed-roots (list allowed)))
    (unwind-protect
        (progn
          (make-directory child)
          (should (ankidemy-org-bridge--allowed-root-p allowed))
          (should (ankidemy-org-bridge--allowed-root-p child))
          (should-not (ankidemy-org-bridge--allowed-root-p sibling)))
      (delete-directory allowed t)
      (delete-directory sibling t))))

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
