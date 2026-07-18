;;; ankidemy-org-bridge.el --- Authenticated local live-import bridge -*- lexical-binding: t; -*-

;; This development bridge requires a caller to prove knowledge of the shared
;; token in its first frame.  Even then, it cannot inspect a root, request a
;; snapshot, or read an asset until the exact active root has a valid manifest.

(require 'cl-lib)
(require 'json)
(require 'org)
(require 'subr-x)
(require 'ankidemy-org-import)

(defgroup ankidemy-org-bridge nil
  "Authenticated local bridge for Ankidemy live import."
  :group 'ankidemy-org)

(defcustom ankidemy-org-bridge-port 35905
  "Loopback TCP port exposed to the development server."
  :type 'integer)

(defcustom ankidemy-org-bridge-host
  (or (getenv "ANKIDEMY_ORG_ROAM_BRIDGE_BIND") "127.0.0.1")
  "Address on which Emacs accepts bridge connections.
Use 0.0.0.0 only for a containerized development server, together with a long
token and a host firewall.  A valid manifest at the exact active Org-roam root
is always required before notebook data can be inspected."
  :type 'string)

(defcustom ankidemy-org-bridge-token
  (or (getenv "ANKIDEMY_ORG_ROAM_BRIDGE_TOKEN")
      (getenv "ANKIDEMY_ORG_BRIDGE_TOKEN"))
  "Shared bridge token, normally supplied through the environment."
  :type '(choice (const :tag "Unset" nil) string))

(defcustom ankidemy-org-bridge-save-debounce 0.1
  "Seconds to debounce snapshot change notifications after saves."
  :type 'number)

(defcustom ankidemy-org-bridge-presence-debounce 0.033
  "Idle debounce for point-follow presence (approximately 30 Hz)."
  :type 'number)

(defcustom ankidemy-org-bridge-filesystem-poll-interval 5
  "Seconds between rename/delete fallback checks."
  :type 'number)

(defcustom ankidemy-org-bridge-manifest-poll-interval 0.25
  "Seconds between checks of the active root's exact manifest path.
This fast poll reads no notebook content.  It exists so a manifest created or
removed outside Emacs changes authorization promptly."
  :type 'number)

(defvar ankidemy-org-bridge--server nil)
(defvar ankidemy-org-bridge--clients nil)
(defvar ankidemy-org-bridge--authenticated (make-hash-table :test #'eq))
(defvar ankidemy-org-bridge--auth-timers (make-hash-table :test #'eq))
(defvar ankidemy-org-bridge--save-timer nil)
(defvar ankidemy-org-bridge--presence-timer nil)
(defvar ankidemy-org-bridge--filesystem-timer nil)
(defvar ankidemy-org-bridge--manifest-timer nil)
(defvar ankidemy-org-bridge--last-filesystem-state nil)
(defvar ankidemy-org-bridge--last-manifest-state nil)
(defvar ankidemy-org-bridge--last-presence nil)
(defvar ankidemy-org-bridge--cache nil)
(defvar ankidemy-org-bridge--instance-id nil)

(defun ankidemy-org-bridge--root ()
  "Return the active normalized Org-roam root, or nil."
  (when (and (boundp 'org-roam-directory) org-roam-directory)
    (file-name-as-directory (file-truename org-roam-directory))))

(defun ankidemy-org-bridge--manifest (root)
  "Return ROOT's valid exact manifest, or nil.
No directory traversal or notebook-content read occurs here."
  (when root
    (let ((file (expand-file-name "ankidemy.org" root)))
      (when (file-readable-p file)
        (car-safe (ankidemy-org--read-manifest file))))))

(defun ankidemy-org-bridge--approved-root-p (root)
  "Return non-nil when ROOT contains a valid exact manifest."
  (and root (ankidemy-org-bridge--manifest root) t))

(defun ankidemy-org-bridge--active-approved-root ()
  "Return the active root only after its exact manifest grants consent."
  (when-let ((root (ankidemy-org-bridge--root)))
    (when (ankidemy-org-bridge--approved-root-p root)
      root)))

(defun ankidemy-org-bridge--root-info (&optional root)
  "Return protocol metadata for manifested ROOT or the active root.
Unmanifested roots are represented without their path or metadata."
  (let* ((root (or root (ankidemy-org-bridge--root)))
         (manifest (ankidemy-org-bridge--manifest root)))
    `((root . ,(if manifest root ""))
      (hasManifest . ,(if manifest t :json-false))
      ,@(when manifest
          `((providerNotebookId . ,(plist-get manifest :id))
            (title . ,(plist-get manifest :title))
            (schema . ,(plist-get manifest :schema)))))))

(defun ankidemy-org-bridge--same-root-p (requested)
  "Return non-nil when REQUESTED names the approved active root."
  (and (stringp requested)
       (ankidemy-org-bridge--root)
       (file-equal-p (file-truename requested)
                     (ankidemy-org-bridge--root))
       (ankidemy-org-bridge--approved-root-p requested)))

(defun ankidemy-org-bridge--json-send (websocket value)
  "Send VALUE as one JSON text frame to WEBSOCKET."
  (when (and websocket (eq (websocket-ready-state websocket) 'open))
    ;; The socket may close between the ready-state check and the write.  Timer
    ;; callbacks must not surface that benign race in the user's Emacs session.
    (condition-case nil
        (websocket-send-text
         websocket
         (json-serialize value :null-object nil :false-object :json-false))
      (error nil))))

(defun ankidemy-org-bridge--notify (type params)
  "Send notification TYPE with PARAMS to authenticated clients."
  ;; A root change must always clear the server's previous root.  For an
  ;; unmanifested root PARAMS is redacted by `ankidemy-org-bridge--root-info'.
  ;; All data-bearing notifications remain suspended without a manifest.
  (when (or (string= type "root.changed")
            (ankidemy-org-bridge--active-approved-root))
    (dolist (websocket (copy-sequence ankidemy-org-bridge--clients))
      (when (gethash websocket ankidemy-org-bridge--authenticated)
        (ankidemy-org-bridge--json-send
         websocket `((type . ,type) (params . ,params)))))))

(defun ankidemy-org-bridge--response (websocket id result)
  "Send successful request ID with RESULT to WEBSOCKET."
  (ankidemy-org-bridge--json-send
   websocket `((type . "response") (id . ,id) (ok . t) (result . ,result))))

(defun ankidemy-org-bridge--error (websocket id message)
  "Send failed request ID with MESSAGE to WEBSOCKET."
  (ankidemy-org-bridge--json-send
   websocket `((type . "response") (id . ,(or id ""))
               (ok . :json-false) (error . ,message))))

(defun ankidemy-org-bridge--signature (root)
  "Return a cheap content signature for all Org inputs below ROOT."
  (secure-hash
   'sha256
   (mapconcat
    (lambda (file)
      (let ((attributes (file-attributes file 'string)))
        (format "%s\0%s\0%s" (file-relative-name file root)
                (file-attribute-size attributes)
                (float-time (file-attribute-modification-time attributes)))))
    (sort (directory-files-recursively root "\\.org\\'" nil nil t) #'string<)
    "\n")))

(defun ankidemy-org-bridge--build-asset-map (snapshot root)
  "Build authorized digest metadata from SNAPSHOT below ROOT."
  (let ((assets (make-hash-table :test #'equal)))
    (mapc (lambda (item)
            (let* ((id (alist-get 'id item))
                   (relative (alist-get 'sourceLocator item))
                   (file (and relative (expand-file-name relative root))))
              (when (and id file (file-readable-p file)
                         (file-in-directory-p (file-truename file) root))
                (puthash id `((file . ,(file-truename file))
                              (mime . ,(alist-get 'mime item))
                              (size . ,(alist-get 'byteSize item)))
                         assets))))
          (alist-get 'assets snapshot))
    assets))

(defun ankidemy-org-bridge--snapshot (root)
  "Return cached semantic snapshot for ROOT, reparsing only after changes."
  (unless (ankidemy-org-bridge--same-root-p root)
    (error "Requested root is not the active Org-roam root"))
  (let ((signature (ankidemy-org-bridge--signature root)))
    (if (and ankidemy-org-bridge--cache
             (equal root (plist-get ankidemy-org-bridge--cache :root))
             (equal signature (plist-get ankidemy-org-bridge--cache :signature)))
        (plist-get ankidemy-org-bridge--cache :snapshot)
      (let* ((json (ankidemy-org-snapshot-json root))
             (snapshot (json-parse-string json :object-type 'alist
                                          ;; Retain the array/object
                                          ;; distinction when the snapshot is
                                          ;; embedded in a response envelope.
                                          :array-type 'array
                                          :null-object nil
                                          :false-object :json-false)))
        (setq ankidemy-org-bridge--cache
              (list :root root :signature signature :snapshot snapshot
                    :assets (ankidemy-org-bridge--build-asset-map snapshot root)))
        snapshot))))

(defun ankidemy-org-bridge--asset (root sha256)
  "Return verified base64 asset SHA256 from active ROOT snapshot."
  (ankidemy-org-bridge--snapshot root)
  (let* ((record (gethash sha256 (plist-get ankidemy-org-bridge--cache :assets)))
         (file (alist-get 'file record))
         (expected-size (alist-get 'size record)))
    (unless record
      (error "Asset is not owned by the current semantic snapshot"))
    (unless (and file (file-readable-p file)
                 (file-in-directory-p (file-truename file) root))
      (error "Asset is no longer readable inside the active root"))
    (with-temp-buffer
      (set-buffer-multibyte nil)
      (insert-file-contents-literally file)
      (let* ((actual-size (buffer-size))
             (actual-id (concat "sha256:" (secure-hash 'sha256 (current-buffer)))))
        (unless (and (equal sha256 actual-id) (= expected-size actual-size))
          (error "Asset changed after snapshot generation"))
        `((sha256 . ,sha256)
          (mime . ,(alist-get 'mime record))
          (size . ,actual-size)
          (base64 . ,(base64-encode-string (buffer-string) t)))))))

(defun ankidemy-org-bridge--dispatch-request (websocket message)
  "Dispatch authenticated request MESSAGE from WEBSOCKET."
  (let* ((id (alist-get 'id message))
         (method (alist-get 'method message))
         (params (alist-get 'params message))
         (root (alist-get 'root params)))
    (condition-case err
        (pcase method
          ("health.get"
           (let ((active (ankidemy-org-bridge--active-approved-root)))
             (ankidemy-org-bridge--response
              websocket id
              `((protocolVersion . 1)
                (instanceId . ,ankidemy-org-bridge--instance-id)
                (emacsVersion . ,emacs-version)
                (orgVersion . ,(org-version))
                (orgRoamVersion . ,(or (and (fboundp 'org-roam-version)
                                            (org-roam-version)) "unknown"))
                (currentDb . ,(if (and active (boundp 'org-roam-db-location))
                                  org-roam-db-location ""))
                (sourceRevision . ,(and active
                                        (ankidemy-org-bridge--signature active)))
                (root . ,(ankidemy-org-bridge--root-info active))))))
          ("snapshot.get"
           (ankidemy-org-bridge--response
            websocket id (ankidemy-org-bridge--snapshot root)))
          ("asset.get"
           (ankidemy-org-bridge--response
            websocket id
            (ankidemy-org-bridge--asset root (alist-get 'sha256 params))))
          (_ (error "Unsupported bridge method: %s" method)))
      (error (ankidemy-org-bridge--error websocket id (error-message-string err))))))

(defun ankidemy-org-bridge--authenticate (websocket message)
  "Authenticate WEBSOCKET using first-frame MESSAGE."
  (let ((provided (alist-get 'token message)))
    (if (and (stringp ankidemy-org-bridge-token)
             (not (string-empty-p ankidemy-org-bridge-token))
             (stringp provided)
             (string= provided ankidemy-org-bridge-token))
        (progn
          (puthash websocket t ankidemy-org-bridge--authenticated)
          (when-let ((timer (gethash websocket ankidemy-org-bridge--auth-timers)))
            (cancel-timer timer)
            (remhash websocket ankidemy-org-bridge--auth-timers))
          (ankidemy-org-bridge--json-send
           websocket `((type . "authenticated") (ok . t)
                       (instanceId . ,ankidemy-org-bridge--instance-id)))
          (ankidemy-org-bridge--json-send
           websocket `((type . "root.changed")
                       (params . ((root . ,(ankidemy-org-bridge--root-info)))))))
      (ankidemy-org-bridge--json-send
       websocket '((type . "authenticated") (ok . :json-false)
                   (error . "Authentication rejected")))
      (websocket-close websocket))))

(defun ankidemy-org-bridge--on-open (websocket)
  "Register unauthenticated WEBSOCKET with a short handshake deadline."
  (push websocket ankidemy-org-bridge--clients)
  (puthash
   websocket
   (run-at-time
    3 nil
    (lambda (candidate)
      (unless (gethash candidate ankidemy-org-bridge--authenticated)
        (ignore-errors (websocket-close candidate))))
    websocket)
   ankidemy-org-bridge--auth-timers))

(defun ankidemy-org-bridge--on-message (websocket frame)
  "Handle one FRAME received from WEBSOCKET."
  (condition-case err
      (let* ((payload (websocket-frame-payload frame))
             (message (json-parse-string payload :object-type 'alist
                                         :array-type 'list :null-object nil
                                         :false-object :json-false))
             (type (alist-get 'type message)))
        (if (gethash websocket ankidemy-org-bridge--authenticated)
            (pcase type
              ("request" (ankidemy-org-bridge--dispatch-request websocket message))
              ("ping" (ankidemy-org-bridge--json-send websocket '((type . "pong"))))
              (_ (ankidemy-org-bridge--error websocket nil "Unsupported frame type")))
          (if (string= type "auth")
              (ankidemy-org-bridge--authenticate websocket message)
            (websocket-close websocket))))
    (error
     (if (gethash websocket ankidemy-org-bridge--authenticated)
         (ankidemy-org-bridge--error websocket nil (error-message-string err))
       (websocket-close websocket)))))

(defun ankidemy-org-bridge--on-close (websocket)
  "Forget closed WEBSOCKET and its timers."
  (setq ankidemy-org-bridge--clients
        (delq websocket ankidemy-org-bridge--clients))
  (remhash websocket ankidemy-org-bridge--authenticated)
  (when-let ((timer (gethash websocket ankidemy-org-bridge--auth-timers)))
    (cancel-timer timer)
    (remhash websocket ankidemy-org-bridge--auth-timers)))

(defun ankidemy-org-bridge--root-watcher (_symbol new-value operation _where)
  "Clear cached access and report a redacted or approved NEW-VALUE promptly."
  (when (and ankidemy-org-bridge-mode
             (memq operation '(set let unlet makunbound)))
    (when ankidemy-org-bridge--save-timer
      (cancel-timer ankidemy-org-bridge--save-timer))
    (when ankidemy-org-bridge--presence-timer
      (cancel-timer ankidemy-org-bridge--presence-timer))
    (setq ankidemy-org-bridge--cache nil
          ankidemy-org-bridge--save-timer nil
          ankidemy-org-bridge--presence-timer nil
          ankidemy-org-bridge--last-presence nil
          ankidemy-org-bridge--last-filesystem-state nil
          ankidemy-org-bridge--last-manifest-state nil)
    ;; Variable watchers run before the new value is necessarily observable,
    ;; so re-check the active root on the next timer turn.
    (run-at-time
     0 nil
     (lambda ()
       (ankidemy-org-bridge--notify
        "root.changed" `((root . ,(ankidemy-org-bridge--root-info))))))))

(defun ankidemy-org-bridge--after-save ()
  "Debounce a semantic change notification for saved Org files."
  (let* ((active-root (ankidemy-org-bridge--root))
         (approved-root (ankidemy-org-bridge--active-approved-root))
         (manifest-file (and active-root
                             (expand-file-name "ankidemy.org" active-root))))
    (when (and active-root buffer-file-name manifest-file
               (file-equal-p (file-truename buffer-file-name)
                             (file-truename manifest-file)))
      (setq ankidemy-org-bridge--cache nil)
      (setq ankidemy-org-bridge--last-filesystem-state nil)
      (setq ankidemy-org-bridge--last-manifest-state nil)
      (ankidemy-org-bridge--notify
       "root.changed" `((root . ,(ankidemy-org-bridge--root-info)))))
    (when (and approved-root buffer-file-name
               (string= (downcase (or (file-name-extension buffer-file-name) "")) "org")
               (file-in-directory-p (file-truename buffer-file-name)
                                    approved-root))
      (setq ankidemy-org-bridge--cache nil)
      (setq ankidemy-org-bridge--last-filesystem-state nil)
      (ankidemy-org-bridge--schedule-snapshot-change))))

(defun ankidemy-org-bridge--schedule-snapshot-change (&rest _ignored)
  "Debounce a complete snapshot notification after Org-roam DB work."
  (when (and ankidemy-org-bridge-mode
             (ankidemy-org-bridge--active-approved-root))
    (when ankidemy-org-bridge--save-timer
      (cancel-timer ankidemy-org-bridge--save-timer))
    (setq ankidemy-org-bridge--save-timer
          (run-at-time
           ankidemy-org-bridge-save-debounce nil
           (lambda ()
             (setq ankidemy-org-bridge--save-timer nil)
             (when (ankidemy-org-bridge--active-approved-root)
               (let ((info (ankidemy-org-bridge--root-info)))
                 (when (eq (alist-get 'hasManifest info) t)
                   (ankidemy-org-bridge--notify
                    "snapshot.changed" `((root . ,info)))))))))))

(defun ankidemy-org-bridge--presence-at-point ()
  "Return current managed Org source ID without modifying the buffer."
  (when (and (derived-mode-p 'org-mode) buffer-file-name)
    (let ((root (ankidemy-org-bridge--active-approved-root)))
      (when (and root (file-in-directory-p (file-truename buffer-file-name) root))
        (or (and (fboundp 'org-roam-id-at-point) (org-roam-id-at-point))
            (org-entry-get nil "ID" t))))))

(defun ankidemy-org-bridge--queue-presence ()
  "Coalesce point motion before publishing editor presence."
  (when ankidemy-org-bridge--presence-timer
    (cancel-timer ankidemy-org-bridge--presence-timer)
    (setq ankidemy-org-bridge--presence-timer nil))
  (when (ankidemy-org-bridge--active-approved-root)
    (setq ankidemy-org-bridge--presence-timer
          (run-with-idle-timer
           ankidemy-org-bridge-presence-debounce nil
           (lambda ()
             (setq ankidemy-org-bridge--presence-timer nil)
             (when (ankidemy-org-bridge--active-approved-root)
               (let* ((root-info (ankidemy-org-bridge--root-info))
                      (source-id (or (ankidemy-org-bridge--presence-at-point) ""))
                      (presence (cons (alist-get 'root root-info) source-id)))
                 (unless (equal presence ankidemy-org-bridge--last-presence)
                   (setq ankidemy-org-bridge--last-presence presence)
                   (ankidemy-org-bridge--notify
                    "presence.changed"
                    `((root . ,root-info) (sourceId . ,source-id)))))))))))

(defun ankidemy-org-bridge--poll-filesystem ()
  "Detect rename/delete changes that do not pass through `after-save-hook'."
  (when-let ((root (ankidemy-org-bridge--active-approved-root)))
    (condition-case nil
        (let ((state (cons root (ankidemy-org-bridge--signature root))))
          (when (and ankidemy-org-bridge--last-filesystem-state
                     (not (equal state ankidemy-org-bridge--last-filesystem-state)))
            (setq ankidemy-org-bridge--cache nil)
            (ankidemy-org-bridge--notify
             "root.changed" `((root . ,(ankidemy-org-bridge--root-info))))
            (ankidemy-org-bridge--schedule-snapshot-change))
          (setq ankidemy-org-bridge--last-filesystem-state state))
      (file-error nil))))

(defun ankidemy-org-bridge--manifest-state ()
  "Return a fingerprint of only the active root and its exact manifest."
  (when-let ((root (ankidemy-org-bridge--root)))
    (let ((manifest-file (expand-file-name "ankidemy.org" root)))
      (cons root
            (when (file-readable-p manifest-file)
              (with-temp-buffer
                (insert-file-contents manifest-file)
                (secure-hash 'sha256 (current-buffer))))))))

(defun ankidemy-org-bridge--poll-manifest ()
  "Detect external creation, removal, or edits of the consent manifest."
  (condition-case nil
      (let ((state (ankidemy-org-bridge--manifest-state)))
        (when (and ankidemy-org-bridge--last-manifest-state
                   (not (equal state ankidemy-org-bridge--last-manifest-state)))
          (setq ankidemy-org-bridge--cache nil
                ankidemy-org-bridge--last-filesystem-state nil)
          (ankidemy-org-bridge--notify
           "root.changed" `((root . ,(ankidemy-org-bridge--root-info))))
          (ankidemy-org-bridge--schedule-snapshot-change))
        (setq ankidemy-org-bridge--last-manifest-state state))
    (file-error nil)))

;;;###autoload
(define-minor-mode ankidemy-org-bridge-mode
  "Run the authenticated Ankidemy development bridge on loopback."
  :global t
  :group 'ankidemy-org-bridge
  (if ankidemy-org-bridge-mode
      (progn
        (unless (and (stringp ankidemy-org-bridge-token)
                     (>= (length ankidemy-org-bridge-token) 24))
          (setq ankidemy-org-bridge-mode nil)
          (user-error "ANKIDEMY_ORG_ROAM_BRIDGE_TOKEN must contain at least 24 characters"))
        (unless (require 'websocket nil t)
          (setq ankidemy-org-bridge-mode nil)
          (user-error "The Emacs websocket package is required"))
        (setq ankidemy-org-bridge--instance-id
              (format "emacs-%s-%s" (emacs-pid)
                      (substring (secure-hash 'sha256
                                              (format "%s:%s:%s" (emacs-pid)
                                                      (float-time) (random)))
                                 0 12)))
        (setq ankidemy-org-bridge--server
              (websocket-server
               ankidemy-org-bridge-port :host ankidemy-org-bridge-host
               :on-open #'ankidemy-org-bridge--on-open
               :on-message #'ankidemy-org-bridge--on-message
               :on-close #'ankidemy-org-bridge--on-close))
        (add-variable-watcher 'org-roam-directory
                              #'ankidemy-org-bridge--root-watcher)
        (add-hook 'after-save-hook #'ankidemy-org-bridge--after-save)
        (add-hook 'post-command-hook #'ankidemy-org-bridge--queue-presence)
        (dolist (function '(org-roam-db-update-file org-roam-db-sync
                            org-roam-db-clear-all))
          (when (fboundp function)
            (advice-add function :after
                        #'ankidemy-org-bridge--schedule-snapshot-change)))
        (setq ankidemy-org-bridge--filesystem-timer
              (run-at-time ankidemy-org-bridge-filesystem-poll-interval
                           ankidemy-org-bridge-filesystem-poll-interval
                           #'ankidemy-org-bridge--poll-filesystem))
        (setq ankidemy-org-bridge--manifest-timer
              (run-at-time ankidemy-org-bridge-manifest-poll-interval
                           ankidemy-org-bridge-manifest-poll-interval
                           #'ankidemy-org-bridge--poll-manifest))
        (message "Ankidemy Org bridge listening on %s:%d"
                 ankidemy-org-bridge-host ankidemy-org-bridge-port))
    (remove-hook 'after-save-hook #'ankidemy-org-bridge--after-save)
    (remove-hook 'post-command-hook #'ankidemy-org-bridge--queue-presence)
    (dolist (function '(org-roam-db-update-file org-roam-db-sync
                        org-roam-db-clear-all))
      (when (fboundp function)
        (advice-remove function
                       #'ankidemy-org-bridge--schedule-snapshot-change)))
    (ignore-errors
      (remove-variable-watcher 'org-roam-directory
                               #'ankidemy-org-bridge--root-watcher))
    (when ankidemy-org-bridge--save-timer
      (cancel-timer ankidemy-org-bridge--save-timer))
    (when ankidemy-org-bridge--presence-timer
      (cancel-timer ankidemy-org-bridge--presence-timer))
    (when ankidemy-org-bridge--filesystem-timer
      (cancel-timer ankidemy-org-bridge--filesystem-timer))
    (when ankidemy-org-bridge--manifest-timer
      (cancel-timer ankidemy-org-bridge--manifest-timer))
    (when ankidemy-org-bridge--server
      (websocket-server-close ankidemy-org-bridge--server))
    (setq ankidemy-org-bridge--server nil
          ankidemy-org-bridge--clients nil
          ankidemy-org-bridge--cache nil
          ankidemy-org-bridge--save-timer nil
          ankidemy-org-bridge--presence-timer nil
          ankidemy-org-bridge--filesystem-timer nil
          ankidemy-org-bridge--manifest-timer nil
          ankidemy-org-bridge--last-filesystem-state nil
          ankidemy-org-bridge--last-manifest-state nil)
    (clrhash ankidemy-org-bridge--authenticated)
    (clrhash ankidemy-org-bridge--auth-timers)
    (message "Ankidemy Org bridge stopped")))

(provide 'ankidemy-org-bridge)
;;; ankidemy-org-bridge.el ends here
