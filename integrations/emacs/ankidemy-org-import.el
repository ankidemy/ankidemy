;;; ankidemy-org-import.el --- Org semantic adapter for Ankidemy -*- lexical-binding: t; -*-

;; This file is intentionally independent of Doom and org-roam internals.  It
;; parses Org with Org's own AST and emits provider-neutral semantic records.

(require 'cl-lib)
(require 'json)
(require 'org)
(require 'org-element)
(require 'ox-md)
(require 'subr-x)

(defgroup ankidemy-org nil
  "Local Org-to-Ankidemy semantic import."
  :group 'org)

(defcustom ankidemy-org-default-quest-time
  (or (getenv "ANKIDEMY_ORG_DEFAULT_QUEST_TIME") "09:00")
  "Local time used when an active planning timestamp has no time."
  :type 'string)

(defcustom ankidemy-org-timezone (getenv "ANKIDEMY_ORG_TIMEZONE")
  "Timezone used for quest timestamps, or nil for the Emacs local timezone."
  :type '(choice (const :tag "Emacs local timezone" nil) string))

(defconst ankidemy-org--image-extensions
  '("avif" "gif" "jpeg" "jpg" "png" "svg" "webp")
  "Local file extensions treated as image assets.")

(defconst ankidemy-org--reserved-tags
  '("version" "notes" "references" "hints" "solution")
  "Local structural tags used by the Ankidemy grammar.")

(cl-defstruct ankidemy-org--context
  root files external-notebooks local-ids excluded-ids external-ids
  nodes edges assets diagnostics evidence-counter)

(defvar ankidemy-org--root-caches (make-hash-table :test #'equal)
  "Per-root semantic records keyed by file signature.")

(defvar ankidemy-org--index-caches (make-hash-table :test #'equal)
  "Per-file durable ID records used to rebuild root indexes cheaply.")

(defvar ankidemy-org--lint-caches (make-hash-table :test #'equal)
  "Per-file syntax diagnostics keyed by save-boundary signature.")

(defun ankidemy-org--diag (severity code message file &optional line column source-id related)
  "Build one actionable diagnostic record."
  (list :severity severity :code code :message message
        :location (list :file file :line line :column column)
        :source-id source-id :related-source-ids related))

(defun ankidemy-org--push-diag (context severity code message file &optional line column source-id related)
  "Append one diagnostic to CONTEXT."
  (push (ankidemy-org--diag severity code message file line column source-id related)
        (ankidemy-org--context-diagnostics context)))

(defun ankidemy-org--manifest-value (text key)
  "Return manifest KEY from Org TEXT, matching case-insensitively."
  (let ((case-fold-search t))
    (when (string-match (format "^#\\+%s:[ \t]*\\(.+?\\)[ \t]*$"
                                (regexp-quote key)) text)
      (string-trim (match-string 1 text)))))

(defun ankidemy-org--read-manifest (file)
  "Read and validate manifest FILE.
Return (MANIFEST . DIAGNOSTIC), with one side nil."
  (condition-case err
      (let* ((text (with-temp-buffer
                     (insert-file-contents file)
                     (buffer-string)))
             (title (ankidemy-org--manifest-value text "title"))
             (id (ankidemy-org--manifest-value text "ankidemy_notebook_id"))
             (schema-text (ankidemy-org--manifest-value text "ankidemy_schema"))
             (schema (and schema-text (string-to-number schema-text))))
        (if (and title (not (string-empty-p title))
                 id (not (string-empty-p id))
                 (= schema 1))
            (cons (list :title title :id id :schema schema :file file) nil)
          (cons nil (ankidemy-org--diag
                     "error" "manifest.invalid"
                     "Manifest requires title, notebook ID, and schema 1"
                     file 1 1))))
    (error
     (cons nil (ankidemy-org--diag
                "error" "file.unreadable" (error-message-string err) file 1 1)))))

(defun ankidemy-org--under-directory-p (file directory)
  "Return non-nil when FILE is strictly below DIRECTORY."
  (file-in-directory-p (expand-file-name file)
                       (file-name-as-directory (expand-file-name directory))))

(defun ankidemy-org--discover (root)
  "Discover explicitly bounded Org files below ROOT.
Return a plist with root manifest, files, nested manifests, and diagnostics."
  (let* ((root (file-name-as-directory (file-truename root)))
         (root-manifest-file (expand-file-name "ankidemy.org" root))
         (root-result (and (file-exists-p root-manifest-file)
                           (ankidemy-org--read-manifest root-manifest-file)))
         (diagnostics nil)
         (nested nil)
         (nested-roots nil)
         (seen-ids (make-hash-table :test #'equal)))
    (unless root-result
      (push (ankidemy-org--diag "error" "manifest.missing"
                                "Explicit ankidemy.org manifest is required"
                                root-manifest-file 1 1)
            diagnostics))
    (when (and root-result (cdr root-result))
      (push (cdr root-result) diagnostics))
    (when (car-safe root-result)
      (puthash (plist-get (car root-result) :id) root seen-ids))
    (dolist (manifest-file (directory-files-recursively root "\\`ankidemy\\.org\\'" nil nil t))
      (unless (file-equal-p manifest-file root-manifest-file)
        (let* ((result (ankidemy-org--read-manifest manifest-file))
               (manifest (car result))
               (nested-root (file-name-directory (file-truename manifest-file))))
          (push nested-root nested-roots)
          (if (cdr result)
              (push (let ((diag (copy-sequence (cdr result))))
                      (plist-put diag :code "manifest.nested_invalid") diag)
                    diagnostics)
            (let* ((id (plist-get manifest :id))
                   (previous (gethash id seen-ids)))
              (if previous
                  (push (ankidemy-org--diag
                         "error" "manifest.duplicate_id"
                         (format "Notebook ID %s also appears at %s" id previous)
                         manifest-file 1 1 nil (list previous))
                        diagnostics)
                (puthash id nested-root seen-ids)
                (push (list :provider-notebook-id id
                            :relative-root (directory-file-name
                                            (file-relative-name nested-root root)))
                      nested)))))))
    (let (files)
      (dolist (file (directory-files-recursively root "\\.org\\'" nil nil t))
        (let ((true-file (file-truename file)))
          (unless (or (string= (file-name-nondirectory file) "ankidemy.org")
                      (cl-some (lambda (boundary)
                                 (ankidemy-org--under-directory-p true-file boundary))
                               nested-roots))
            (if (file-in-directory-p true-file root)
                (push true-file files)
              (push (ankidemy-org--diag
                     "error" "file.outside_root"
                     "Symlinked Org file escapes the authorized notebook"
                     file 1 1)
                    diagnostics)))))
      (list :root root :manifest (car-safe root-result)
            :files (sort files #'string<)
            :external-notebooks (nreverse nested)
            :nested-roots nested-roots
            :diagnostics (nreverse diagnostics)))))

(defun ankidemy-org--drawer-errors (file)
  "Return diagnostics for malformed or misplaced property drawers in FILE."
  (let (errors open-line heading-line content-seen)
    (with-temp-buffer
      (insert-file-contents file)
      (goto-char (point-min))
      (let ((line 0) (case-fold-search t))
        (while (not (eobp))
          (setq line (1+ line))
          (let ((text (buffer-substring-no-properties
                       (line-beginning-position) (line-end-position))))
            (cond
             ((string-match-p "^\\*+ " text)
              (when open-line
                (push (ankidemy-org--diag "error" "file.parse_failed"
                                          "Property drawer has no :END: before the next heading"
                                          file open-line 1)
                      errors))
              (setq open-line nil
                    heading-line line
                    content-seen nil))
             ((string-match-p "^[ \t]*:PROPERTIES:[ \t]*$" text)
              (when open-line
                (push (ankidemy-org--diag "error" "file.parse_failed"
                                          "Nested/unclosed property drawer"
                                          file open-line 1)
                      errors))
              (when (and heading-line content-seen)
                (push (ankidemy-org--diag
                       "error" "property_drawer.misplaced"
                       "Property drawer must immediately follow its heading and planning line; move it above the node body"
                       file line 1)
                      errors))
              (setq open-line line))
             ((and open-line (string-match-p "^[ \t]*:END:[ \t]*$" text))
              (setq open-line nil))
             (open-line)
             ((or (string-match-p "^[ \t]*$" text)
                  (string-match-p
                   "^[ \t]*\\(?:SCHEDULED\\|DEADLINE\\|CLOSED\\):" text)))
             (heading-line
              (setq content-seen t))))
          (forward-line 1))))
    (when open-line
      (push (ankidemy-org--diag "error" "file.parse_failed"
                                "Property drawer has no closing :END:"
                                file open-line 1)
            errors))
    (nreverse errors)))

(defun ankidemy-org--latex-errors (file)
  "Return diagnostics for obviously unbalanced Org LaTeX fragments in FILE."
  (let ((pairs '(("\\\\(" . "\\\\)") ("\\\\\\[" . "\\\\\\]")))
        errors)
    (with-temp-buffer
      (insert-file-contents file)
      (dolist (pair pairs)
        (goto-char (point-min))
        (let ((open-count 0) (close-count 0) first-open)
          (while (re-search-forward (car pair) nil t)
            (setq open-count (1+ open-count))
            (unless first-open (setq first-open (line-number-at-pos))))
          (goto-char (point-min))
          (while (re-search-forward (cdr pair) nil t)
            (setq close-count (1+ close-count)))
          (unless (= open-count close-count)
            (push (ankidemy-org--diag
                   "error" "latex.malformed"
                   (format "Unbalanced LaTeX delimiters %s ... %s" (car pair) (cdr pair))
                   file (or first-open 1) 1)
                  errors))))
      (goto-char (point-min))
      (while (re-search-forward "\\\\begin{\\([A-Za-z*]+\\)}" nil t)
        (let ((environment (match-string 1))
              (line (line-number-at-pos)))
          (unless (save-excursion
                    (re-search-forward
                     (format "\\\\end{%s}" (regexp-quote environment)) nil t))
            (push (ankidemy-org--diag
                   "error" "latex.malformed"
                   (format "Unclosed LaTeX environment %s" environment)
                   file line 1)
                  errors)))))
    (nreverse errors)))

(defun ankidemy-org--headline-property (headline property)
  "Read local PROPERTY from parsed HEADLINE."
  (org-element-property (intern (concat ":" (upcase property))) headline))

(defun ankidemy-org--file-property (property)
  "Read PROPERTY only from the document drawer before the first headline.
Unlike `org-entry-get' at `point-min', this never borrows properties from the
first outline node when a file has no document-level drawer."
  (save-excursion
    (goto-char (point-min))
    (let* ((case-fold-search t)
           (headline (save-excursion
                       (when (re-search-forward "^\\*+ " nil t)
                         (line-beginning-position))))
           (limit (or headline (point-max))))
      (when (re-search-forward "^[ \t]*:PROPERTIES:[ \t]*$" limit t)
        (let ((drawer-end (save-excursion
                            (when (re-search-forward "^[ \t]*:END:[ \t]*$" limit t)
                              (line-beginning-position)))))
          (when drawer-end
            (when (re-search-forward
                   (format "^[ \t]*:%s:[ \t]*\\(.*?\\)[ \t]*$"
                           (regexp-quote property))
                   drawer-end t)
              (string-trim (match-string-no-properties 1)))))))))

(defun ankidemy-org--headline-import-p (headline)
  "Return non-nil unless HEADLINE explicitly has ANKIDEMY_IMPORT nil."
  (not (string= (downcase (or (ankidemy-org--headline-property
                               headline "ANKIDEMY_IMPORT") ""))
                "nil")))

(defun ankidemy-org--headline-structural-p (headline)
  "Return non-nil when HEADLINE is a reserved structural heading."
  (cl-intersection (org-element-property :tags headline)
                   ankidemy-org--reserved-tags :test #'string=))

(defun ankidemy-org--headline-type (headline)
  "Classify HEADLINE using local type, TODO, and planning syntax."
  (or (ankidemy-org--headline-property headline "ANKIDEMY_TYPE")
      (and (or (org-element-property :todo-keyword headline)
               (org-element-property :scheduled headline)
               (org-element-property :deadline headline)
               (ankidemy-org--headline-raw-planning-p headline))
           "quest")
      "source"))

(defun ankidemy-org--headline-raw-planning-p (headline)
  "Return non-nil when HEADLINE contains an active or inactive planning line."
  (when-let ((section (ankidemy-org--direct-section headline)))
    (let ((text (buffer-substring-no-properties
                 (org-element-property :begin section)
                 (org-element-property :end section))))
      (string-match-p
       "^[ \t]*\\(?:SCHEDULED\\|DEADLINE\\):[ \t]*\\(?:<\\|\\[\\)"
       text))))

(defun ankidemy-org--line (element)
  "Return one-based source line for ELEMENT."
  (line-number-at-pos (org-element-property :begin element)))

(defun ankidemy-org--immediate-headlines (element)
  "Return immediate headline children of ELEMENT."
  (cl-remove-if-not (lambda (child) (eq (org-element-type child) 'headline))
                    (org-element-contents element)))

(defun ankidemy-org--direct-section (element)
  "Return ELEMENT's immediate section, if any."
  (cl-find-if (lambda (child) (memq (org-element-type child) '(section)))
              (org-element-contents element)))

(defun ankidemy-org--normalize-math (markdown)
  "Normalize Markdown's supported raw TeX environments to display math."
  (let ((case-fold-search nil)
        (start 0)
        (pattern "\\\\begin{\\(equation\\*?\\|align\\*?\\|gather\\*?\\|multline\\*?\\)}"))
    (while (string-match pattern markdown start)
      (let* ((environment (match-string 1 markdown))
             (begin (match-beginning 0))
             (end-pattern (format "\\\\end{%s}" (regexp-quote environment))))
        (if (string-match end-pattern markdown (match-end 0))
            (let ((end (match-end 0)))
              (setq markdown
                    (concat (substring markdown 0 begin) "$$\n"
                            (substring markdown begin end) "\n$$"
                            (substring markdown end))
                    start (+ end 6)))
          (setq start (match-end 0)))))
    markdown))

(defun ankidemy-org--mime-for-file (file)
  "Return a conservative image MIME for FILE."
  (pcase (downcase (or (file-name-extension file) ""))
    ("avif" "image/avif") ("gif" "image/gif")
    ((or "jpeg" "jpg") "image/jpeg") ("png" "image/png")
    ("svg" "image/svg+xml") ("webp" "image/webp") (_ nil)))

(defun ankidemy-org--asset-id (file)
  "Return content-addressed ID for FILE bytes."
  (concat "sha256:"
          (with-temp-buffer
            (set-buffer-multibyte nil)
            (insert-file-contents-literally file)
            (secure-hash 'sha256 (current-buffer)))))

(defun ankidemy-org--resolve-assets (context section file owner-id owner-role owner-field)
  "Return (ASSETS REWRITES) for image links in SECTION."
  (let (assets rewrites)
    (when section
      (org-element-map section 'link
        (lambda (link)
          (let* ((type (org-element-property :type link))
                 (raw-path (org-element-property :path link))
                 (extension (downcase (or (file-name-extension raw-path) ""))))
            (when (and (member type '("file" "attachment"))
                       (member extension ankidemy-org--image-extensions))
              (let* ((candidate
                      (if (string= type "attachment")
                          (when (fboundp 'org-attach-dir)
                            (save-excursion
                              (goto-char (org-element-property :begin link))
                              (when-let ((directory (org-attach-dir nil)))
                                (expand-file-name raw-path directory))))
                        (expand-file-name raw-path (file-name-directory file))))
                     (line (ankidemy-org--line link)))
                (cond
                 ((not candidate)
                  (ankidemy-org--push-diag context "error" "media.unreadable"
                                            "Cannot resolve Org attachment directory"
                                            file line 1 owner-id))
                 ((not (file-readable-p candidate))
                  (ankidemy-org--push-diag context "error" "media.unreadable"
                                            (format "Cannot read image %s" raw-path)
                                            file line 1 owner-id))
                 ((not (file-in-directory-p (file-truename candidate)
                                             (ankidemy-org--context-root context)))
                  (ankidemy-org--push-diag context "error" "media.outside_root"
                                            (format "Image escapes notebook root: %s" raw-path)
                                            file line 1 owner-id))
                 (t
                  (let* ((true-file (file-truename candidate))
                         (id (ankidemy-org--asset-id true-file))
                         (record (list :id id :owner-source-id owner-id
                                       :owner-role owner-role :owner-field owner-field
                                       :source-locator
                                       (file-relative-name true-file
                                                           (ankidemy-org--context-root context))
                                       :mime (ankidemy-org--mime-for-file true-file)
                                       :byte-size (file-attribute-size
                                                   (file-attributes true-file))
                                       :media-url "")))
                    (push record assets)
                    (push (cons raw-path (concat "asset:" id)) rewrites))))))))))
    (list (nreverse assets) (nreverse rewrites))))

(defun ankidemy-org--export-section (context section file owner-id owner-role owner-field)
  "Export SECTION to Markdown and trace owned image assets."
  (if (not section)
      (list "" nil)
    (let* ((begin (org-element-property :begin section))
           (end (org-element-property :end section))
           (org-text (buffer-substring-no-properties begin end))
           (markdown (string-trim
                      (org-export-string-as org-text 'md t
                                            '(:with-toc nil :with-tags nil
                                              :with-broken-links mark))))
           (asset-result (ankidemy-org--resolve-assets
                          context section file owner-id owner-role owner-field)))
      (dolist (rewrite (cadr asset-result))
        (setq markdown
              (replace-regexp-in-string (regexp-quote (car rewrite))
                                        (cdr rewrite) markdown t t)))
      (list (ankidemy-org--normalize-math markdown) (car asset-result)))))

(defun ankidemy-org--timestamp-components (timestamp)
  "Return date/time components from active Org TIMESTAMP."
  (let* ((hour (org-element-property :hour-start timestamp))
         (minute (org-element-property :minute-start timestamp))
         (default (split-string ankidemy-org-default-quest-time ":")))
    (list (org-element-property :year-start timestamp)
          (org-element-property :month-start timestamp)
          (org-element-property :day-start timestamp)
          (or hour (string-to-number (car default)))
          (or minute (string-to-number (cadr default))))))

(defun ankidemy-org--quest-payload (context headline file source-id)
  "Return Ankidemy quest payload for HEADLINE, emitting diagnostics on CONTEXT."
  (let* ((scheduled (org-element-property :scheduled headline))
         (deadline (org-element-property :deadline headline))
         (timestamp (or scheduled deadline)))
    (when (and (not scheduled) deadline)
      (ankidemy-org--push-diag context "warning" "quest.deadline_used_as_start"
                                "DEADLINE used because SCHEDULED is absent"
                                file (ankidemy-org--line headline) 1 source-id))
    (if (not timestamp)
        (progn
          (let* ((section (ankidemy-org--direct-section headline))
                 (text (and section
                            (buffer-substring-no-properties
                             (org-element-property :begin section)
                             (org-element-property :end section))))
                 (inactive (and text
                                (string-match-p
                                 "^[ \t]*\\(?:SCHEDULED\\|DEADLINE\\):[ \t]*\\["
                                 text))))
            (ankidemy-org--push-diag
             context "error"
             (if inactive "quest.timestamp_inactive" "quest.schedule_missing")
             (if inactive
                 "Inactive timestamps do not schedule agenda quests"
               "Quest requires active SCHEDULED or DEADLINE")
             file (ankidemy-org--line headline) 1 source-id))
          (list :kind "todo" :schedule nil :org-repeater-mode nil))
      (if (not (eq (org-element-property :type timestamp) 'active))
          (ankidemy-org--push-diag context "error" "quest.timestamp_inactive"
                                    "Inactive timestamps do not schedule agenda quests"
                                    file (ankidemy-org--line headline) 1 source-id))
      (pcase-let* ((`(,year ,month ,day ,hour ,minute)
                     (ankidemy-org--timestamp-components timestamp))
                    (time (encode-time 0 minute hour day month year
                                       ankidemy-org-timezone))
                    (dtstart (format-time-string "%Y-%m-%dT%H:%M:%S%:z"
                                                 time ankidemy-org-timezone))
                    (repeater-type (org-element-property :repeater-type timestamp))
                    (value (org-element-property :repeater-value timestamp))
                    (unit (org-element-property :repeater-unit timestamp))
                    (mode (pcase repeater-type
                            ('cumulate "+") ('catch-up "++") ('restart ".+") (_ nil))))
        (cond
         ((not repeater-type)
          (list :kind "todo"
                :schedule (list :type "rrule" :timezone (or ankidemy-org-timezone "local")
                                :dtstart dtstart :rrule "FREQ=DAILY;COUNT=1"
                                :exdate [] :rdate [] :default-snooze-minutes 120)
                :org-repeater-mode nil))
         ((and (= value 1) (eq unit 'day))
          (list :kind "daily"
                :schedule (list :type "daily_pool"
                                :timezone (or ankidemy-org-timezone "local")
                                :cooldown-days-override :json-null)
                :org-repeater-mode mode))
         (t
          (let ((frequency (pcase unit
                             ('day "DAILY") ('week "WEEKLY")
                             ('month "MONTHLY") ('year "YEARLY") (_ nil))))
            (if (not frequency)
                (progn
                  (ankidemy-org--push-diag context "error" "quest.repeater_invalid"
                                            (format "Unsupported repeater unit %s" unit)
                                            file (ankidemy-org--line headline) 1 source-id)
                  (list :kind "habit" :schedule nil :org-repeater-mode mode))
              (when (memq repeater-type '(catch-up restart))
                (ankidemy-org--push-diag
                 context "warning" "quest.repeater_semantics_reduced"
                 "Ankidemy retains but cannot exactly reproduce this Org repeater mode"
                 file (ankidemy-org--line headline) 1 source-id))
              (list :kind "habit"
                    :schedule (list :type "habit"
                                    :timezone (or ankidemy-org-timezone "local")
                                    :dtstart dtstart
                                    :rrule (format "FREQ=%s;INTERVAL=%d" frequency value)
                                    :required-completions-per-period 1
                                    :period (symbol-name unit)
                                    :consecutive-periods-to-auto-deactivate 0)
                    :org-repeater-mode mode)))))))))

(defun ankidemy-org--field-by-tag (version tag)
  "Return immediate field child of VERSION having local TAG."
  (cl-find-if (lambda (child)
                (member tag (org-element-property :tags child)))
              (ankidemy-org--immediate-headlines version)))

(defun ankidemy-org--definition-payload (context headline file source-id)
  "Build definition payload and assets for HEADLINE."
  (let (versions assets)
    (dolist (version (ankidemy-org--immediate-headlines headline))
      (when (member "version" (org-element-property :tags version))
        (let* ((version-id (ankidemy-org--headline-property version "ID"))
               (desc (ankidemy-org--export-section
                      context (ankidemy-org--direct-section version) file
                      version-id "definition_version" "descriptionMd"))
               (notes-heading (ankidemy-org--field-by-tag version "notes"))
               (refs-heading (ankidemy-org--field-by-tag version "references"))
               (notes (ankidemy-org--export-section
                       context (and notes-heading (ankidemy-org--direct-section notes-heading))
                       file version-id "definition_version" "notesMd"))
               (refs (ankidemy-org--export-section
                      context (and refs-heading (ankidemy-org--direct-section refs-heading))
                      file version-id "definition_version" "referencesMd")))
          (unless version-id
            (ankidemy-org--push-diag context "error" "version.id_missing"
                                      "Definition version requires ID"
                                      file (ankidemy-org--line version) 1 source-id))
          (unless (string= (downcase (or (ankidemy-org--headline-property
                                          version "ROAM_EXCLUDE") "")) "t")
            (ankidemy-org--push-diag context "error" "version.not_excluded"
                                      "Definition version requires ROAM_EXCLUDE: t"
                                      file (ankidemy-org--line version) 1 version-id))
          (setq assets (append assets (cadr desc) (cadr notes) (cadr refs)))
          (push (list :source-id version-id :order (length versions)
                      :prompt (org-element-property :raw-value version)
                      :description-md (car desc) :notes-md (car notes)
                      :references-md (if (string-empty-p (car refs)) [] (vector (car refs))))
                versions))))
    (unless versions
      (ankidemy-org--push-diag context "error" "version.missing"
                                "Definition requires at least one :version: child"
                                file (ankidemy-org--line headline) 1 source-id))
    (list (list :versions (nreverse versions)) assets)))

(defun ankidemy-org--exercise-payload (context headline file source-id)
  "Build exercise payload and assets for HEADLINE."
  (let (versions assets)
    (dolist (version (ankidemy-org--immediate-headlines headline))
      (when (member "version" (org-element-property :tags version))
        (let* ((version-id (ankidemy-org--headline-property version "ID"))
               (difficulty (string-to-number
                            (or (ankidemy-org--headline-property
                                 version "ANKIDEMY_DIFFICULTY") "3")))
               (verifiable (string= (downcase (or (ankidemy-org--headline-property
                                                   version "ANKIDEMY_VERIFIABLE") "nil")) "t"))
               (desc (ankidemy-org--export-section
                      context (ankidemy-org--direct-section version) file
                      version-id "exercise_version" "descriptionMd"))
               (hints-heading (ankidemy-org--field-by-tag version "hints"))
               (solution-heading (ankidemy-org--field-by-tag version "solution"))
               (notes-heading (ankidemy-org--field-by-tag version "notes"))
               (hints (ankidemy-org--export-section context (and hints-heading (ankidemy-org--direct-section hints-heading)) file version-id "exercise_version" "hintsMd"))
               (solution (ankidemy-org--export-section context (and solution-heading (ankidemy-org--direct-section solution-heading)) file version-id "exercise_version" "solutionMd"))
               (notes (ankidemy-org--export-section context (and notes-heading (ankidemy-org--direct-section notes-heading)) file version-id "exercise_version" "notesMd")))
          (unless version-id
            (ankidemy-org--push-diag context "error" "version.id_missing"
                                      "Exercise version requires ID"
                                      file (ankidemy-org--line version) 1 source-id))
          (unless (string= (downcase (or (ankidemy-org--headline-property
                                          version "ROAM_EXCLUDE") "")) "t")
            (ankidemy-org--push-diag context "error" "version.not_excluded"
                                      "Exercise version requires ROAM_EXCLUDE: t"
                                      file (ankidemy-org--line version) 1 version-id))
          (when (and verifiable (string-empty-p (car solution)))
            (ankidemy-org--push-diag context "error" "exercise.solution_required"
                                      "Verifiable exercise requires :solution: content"
                                      file (ankidemy-org--line version) 1 version-id))
          (setq assets (append assets (cadr desc) (cadr hints) (cadr solution) (cadr notes)))
          (push (list :source-id version-id :order (length versions)
                      :statement (org-element-property :raw-value version)
                      :description-md (car desc) :hints-md (car hints)
                      :solution-md (car solution) :notes-md (car notes)
                      :difficulty difficulty
                      :verifiable (if verifiable t :json-false))
                versions))))
    (unless versions
      (ankidemy-org--push-diag context "error" "version.missing"
                                "Exercise requires at least one :version: child"
                                file (ankidemy-org--line headline) 1 source-id))
    (list (list :versions (nreverse versions)) assets)))

(defun ankidemy-org--edge (context from to evidence owner file line)
  "Append a stable edge to CONTEXT."
  (push (list :from-source-id from :to-source-id to :evidence evidence
              :owner-source-id owner
              :evidence-key
              (format "%s:%s:%s:%s:%s:%d" evidence owner from to
                      (file-relative-name file (ankidemy-org--context-root context)) line)
              :file file :line line)
        (ankidemy-org--context-edges context)))

(defun ankidemy-org--external-edge (context notebook-id external-from to evidence owner file line)
  "Append an external notebook edge to CONTEXT."
  (push (list :from-external-provider-notebook-id notebook-id
              :from-external-source-id external-from :to-source-id to
              :evidence evidence
              :owner-source-id owner
              :evidence-key
              (format "%s:%s:%s:%s:%s:%d" evidence owner external-from to
                      (file-relative-name file (ankidemy-org--context-root context)) line)
              :file file :line line)
        (ankidemy-org--context-edges context)))

(defun ankidemy-org--collect-links (context headline file owner-id)
  "Collect ID-link evidence owned by HEADLINE/OWNER-ID."
  (org-element-map headline 'link
    (lambda (link)
      (when (string= (org-element-property :type link) "id")
        (let* ((target (org-element-property :path link))
               (line (ankidemy-org--line link))
               (local (gethash target (ankidemy-org--context-local-ids context)))
               (excluded (gethash target (ankidemy-org--context-excluded-ids context)))
               (external (gethash target (ankidemy-org--context-external-ids context))))
          (cond
           ((string= target owner-id)
            (ankidemy-org--push-diag context "warning" "link.self_ignored"
                                      "Self link does not create an edge"
                                      file line 1 owner-id))
           (local (ankidemy-org--edge context target owner-id "link" owner-id file line))
           (excluded
            (ankidemy-org--push-diag context "warning" "link.target_excluded"
                                      (format "Link target %s is excluded" target)
                                      file line 1 owner-id))
           (external
            (ankidemy-org--external-edge context external target owner-id "link" owner-id file line))
           (t
            (ankidemy-org--push-diag context "warning" "link.external_id"
                                      (format "ID link target %s is not in an attached notebook" target)
                                      file line 1 owner-id)))))) nil nil
    ;; Do not descend into a child entity: its links belong to that child.  A
    ;; structural version/field has no imported entity ID and remains owned here.
    (lambda (element)
      (and (eq (org-element-type element) 'headline)
           (not (eq element headline))
           (ankidemy-org--headline-property element "ID")
           (not (string= (downcase (or (ankidemy-org--headline-property
                                        element "ROAM_EXCLUDE") "")) "t"))))))

(defun ankidemy-org--process-headline (context headline file parent-id)
  "Process HEADLINE recursively, retaining nearest imported PARENT-ID."
  (let* ((id (ankidemy-org--headline-property headline "ID"))
         (roam-excluded (string= (downcase (or (ankidemy-org--headline-property
                                                headline "ROAM_EXCLUDE") "")) "t"))
         (structural (ankidemy-org--headline-structural-p headline))
         (import-p (ankidemy-org--headline-import-p headline))
         (entity-p (and id (not roam-excluded) (not structural)))
         (next-parent parent-id))
    (when (and entity-p import-p)
      (let* ((type (ankidemy-org--headline-type headline))
             (explicit-type (ankidemy-org--headline-property
                             headline "ANKIDEMY_TYPE"))
             (import-value (downcase (or (ankidemy-org--headline-property
                                          headline "ANKIDEMY_IMPORT") "")))
             (code (or (ankidemy-org--headline-property headline "ANKIDEMY_CODE")
                       (concat "or-" (downcase id))))
             (name (org-element-property :raw-value headline))
             (line (ankidemy-org--line headline))
             (relative-file (file-relative-name file (ankidemy-org--context-root context)))
             payload assets)
        (when (and (not (string-empty-p import-value))
                   (not (member import-value '("t" "nil"))))
          (ankidemy-org--push-diag context "error" "entity.excluded_value"
                                    "ANKIDEMY_IMPORT must be t or nil"
                                    file line 1 id))
        (when (and explicit-type (not (string= explicit-type "quest"))
                   (or (org-element-property :todo-keyword headline)
                       (org-element-property :scheduled headline)
                       (org-element-property :deadline headline)
                       (ankidemy-org--headline-raw-planning-p headline)))
          (ankidemy-org--push-diag context "error" "type.conflict"
                                    "Non-quest type conflicts with TODO/planning syntax"
                                    file line 1 id))
        (pcase type
          ("source"
           (let ((export (ankidemy-org--export-section
                          context (ankidemy-org--direct-section headline) file
                          id "node" "contentMd")))
             (setq payload (list :source (list :content-md (car export)))
                   assets (cadr export))))
          ("definition"
           (let ((result (ankidemy-org--definition-payload context headline file id)))
             (setq payload (list :definition (car result)) assets (cadr result))))
          ("exercise"
           (let ((result (ankidemy-org--exercise-payload context headline file id)))
             (setq payload (list :exercise (car result)) assets (cadr result))))
          ("quest"
           (let* ((export (ankidemy-org--export-section
                           context (ankidemy-org--direct-section headline) file
                           id "quest_version" "descriptionMd"))
                  (quest (ankidemy-org--quest-payload context headline file id)))
             (setq payload (list :quest (append quest
                                                (list :description-md (car export)
                                                      :task-list [])))
                   assets (cadr export))))
          (_
           (ankidemy-org--push-diag context "error" "type.invalid"
                                     (format "Unsupported ANKIDEMY_TYPE %s" type)
                                     file line 1 id)))
        (when payload
          (push (append (list :source-id id :type type :code code :name name
                              :location (list :file relative-file :line line
                                              :outline name))
                        payload)
                (ankidemy-org--context-nodes context))
          (setf (ankidemy-org--context-assets context)
                (append assets (ankidemy-org--context-assets context)))
          (let ((property-parent (ankidemy-org--headline-property
                                  headline "ANKIDEMY_PARENT")))
            (cond
             ((and property-parent parent-id (not (string= property-parent parent-id)))
              (ankidemy-org--push-diag context "error" "structure.parent_conflict"
                                        "ANKIDEMY_PARENT conflicts with outline parent"
                                        file line 1 id (list parent-id property-parent)))
             (property-parent
              (ankidemy-org--edge context
                                   (string-remove-prefix "id:" property-parent)
                                   id "hierarchy" id file line))
             (parent-id
              (ankidemy-org--edge context parent-id id "hierarchy" id file line))))
          (ankidemy-org--collect-links context headline file id)
          (setq next-parent id))))
    ;; Explicit opt-out excludes only this entity; descendants retain the nearest
    ;; previously imported parent.
    (dolist (child (ankidemy-org--immediate-headlines headline))
      (unless (ankidemy-org--headline-structural-p child)
        (ankidemy-org--process-headline context child file next-parent)))))

(defun ankidemy-org--scan-file-index (file external-notebook-id)
  "Return durable ID records and diagnostics for changed FILE."
  (condition-case err
      (with-temp-buffer
        (insert-file-contents file)
        ;; Keep this an anonymous parsing buffer.  Setting `buffer-file-name'
        ;; activates file-aware Doom/Org machinery unrelated to import and can
        ;; block indefinitely (for example project/local-variable hooks).
        ;; Relative links still resolve from the explicit source directory.
        (setq default-directory (file-name-directory file))
        (org-mode)
        (let ((tree (org-element-parse-buffer)) records)
          (when-let ((file-id (ankidemy-org--file-property "ID")))
            (push (list :id file-id
                        :kind (cond (external-notebook-id 'external)
                                    ((string= (downcase
                                               (or (ankidemy-org--file-property
                                                    "ANKIDEMY_IMPORT") ""))
                                              "nil")
                                     'excluded)
                                    (t 'local))
                        :line 1)
                  records))
          (org-element-map tree 'headline
            (lambda (headline)
              (when-let ((id (ankidemy-org--headline-property headline "ID")))
                (push (list :id id
                            :kind
                            (cond
                             (external-notebook-id 'external)
                             ((or (not (ankidemy-org--headline-import-p headline))
                                  (string= (downcase
                                            (or (ankidemy-org--headline-property
                                                 headline "ROAM_EXCLUDE") ""))
                                           "t"))
                              'excluded)
                             (t 'local))
                            :line (ankidemy-org--line headline))
                      records))))
          (list :records (nreverse records) :diagnostics nil)))
    (error
     (list :records nil
           :diagnostics
           (list (ankidemy-org--diag "error" "file.parse_failed"
                                      (error-message-string err) file 1 1))))))

(defun ankidemy-org--index-file (context file &optional external-notebook-id)
  "Index durable IDs in FILE into CONTEXT using a per-file cache.
When EXTERNAL-NOTEBOOK-ID is non-nil, IDs map to that notebook boundary."
  (let* ((cache-key (cons file external-notebook-id))
         (signature (ankidemy-org--file-signature file))
         (entry (gethash cache-key ankidemy-org--index-caches)))
    (unless (equal signature (plist-get entry :signature))
      (setq entry (ankidemy-org--scan-file-index file external-notebook-id))
      (setq entry (plist-put entry :signature signature))
      (puthash cache-key entry ankidemy-org--index-caches))
    (setf (ankidemy-org--context-diagnostics context)
          (append (plist-get entry :diagnostics)
                  (ankidemy-org--context-diagnostics context)))
    (dolist (record (plist-get entry :records))
      (let ((id (plist-get record :id))
            (line (plist-get record :line)))
        (pcase (plist-get record :kind)
          ('external
           (puthash id external-notebook-id
                    (ankidemy-org--context-external-ids context)))
          ('excluded
           (puthash id t (ankidemy-org--context-excluded-ids context)))
          ('local
           (if (gethash id (ankidemy-org--context-local-ids context))
               (ankidemy-org--push-diag context "error" "id.duplicate"
                                         (format "Duplicate Org ID %s" id)
                                         file line 1 id)
             (puthash id file (ankidemy-org--context-local-ids context)))))))))

(defun ankidemy-org--index-external-notebooks (context discovery)
  "Index node IDs below nested boundaries in DISCOVERY."
  (dolist (item (plist-get discovery :external-notebooks))
    (let* ((notebook-id (plist-get item :provider-notebook-id))
           (root (expand-file-name (plist-get item :relative-root)
                                   (ankidemy-org--context-root context))))
      (dolist (file (directory-files-recursively root "\\.org\\'" nil nil t))
        (unless (string= (file-name-nondirectory file) "ankidemy.org")
          (ankidemy-org--index-file context file notebook-id))))))

(defun ankidemy-org--parse-file (context file)
  "Parse semantic records from FILE into CONTEXT."
  (condition-case err
      (with-temp-buffer
        (insert-file-contents file)
        (setq default-directory (file-name-directory file))
        (org-mode)
        (let* ((tree (org-element-parse-buffer))
               (file-id (ankidemy-org--file-property "ID"))
               (file-import (not (string= (downcase (or (ankidemy-org--file-property
                                                         "ANKIDEMY_IMPORT") "")) "nil")))
               (file-type (or (ankidemy-org--file-property "ANKIDEMY_TYPE") "source"))
               (title-element (org-element-map tree 'keyword
                                (lambda (keyword)
                                  (when (string= (org-element-property :key keyword) "TITLE")
                                    keyword)) nil t))
               (title (and title-element (org-element-property :value title-element)))
               (parent-id nil))
          (when (and file-id file-import)
            (if (not (string= file-type "source"))
                (ankidemy-org--push-diag context "error" "type.invalid"
                                          "File-level entities currently support source only"
                                          file 1 1 file-id)
              (let* ((section (ankidemy-org--direct-section tree))
                     (export (ankidemy-org--export-section
                              context section file file-id "node" "contentMd"))
                     (code (or (ankidemy-org--file-property "ANKIDEMY_CODE")
                               (concat "or-" (downcase file-id)))))
                (push (list :source-id file-id :type "source" :code code
                            :name (or title (file-name-base file))
                            :location (list :file (file-relative-name
                                                   file (ankidemy-org--context-root context))
                                            :line 1 :outline (or title ""))
                            :source (list :content-md (car export)))
                      (ankidemy-org--context-nodes context))
                (setf (ankidemy-org--context-assets context)
                      (append (cadr export) (ankidemy-org--context-assets context)))
                (ankidemy-org--collect-links context section file file-id)
                (setq parent-id file-id))))
          (dolist (headline (ankidemy-org--immediate-headlines tree))
            (ankidemy-org--process-headline context headline file parent-id))))
    (error
     (ankidemy-org--push-diag context "error" "file.parse_failed"
                               (error-message-string err) file 1 1))))

(defun ankidemy-org--file-signature (file)
  "Return a cheap signature that changes at the Org save boundary."
  (let ((attributes (file-attributes file 'string)))
    (list (file-attribute-size attributes)
          (float-time (file-attribute-modification-time attributes))
          (file-attribute-inode-number attributes))))

(defun ankidemy-org--lint-file-cached (file)
  "Return cached drawer/LaTeX diagnostics for FILE."
  (let* ((signature (ankidemy-org--file-signature file))
         (entry (gethash file ankidemy-org--lint-caches)))
    (unless (equal signature (plist-get entry :signature))
      (setq entry (list :signature signature
                        :diagnostics (append (ankidemy-org--drawer-errors file)
                                             (ankidemy-org--latex-errors file))))
      (puthash file entry ankidemy-org--lint-caches))
    (copy-sequence (plist-get entry :diagnostics))))

(defun ankidemy-org--hash-table-signature (tables)
  "Return deterministic hash for identity index TABLES."
  (let (items)
    (dolist (table tables)
      (maphash (lambda (key value)
                 (push (format "%s=%s" key value) items))
               table)
      (push "--" items))
    (secure-hash 'sha256 (mapconcat #'identity (sort items #'string<) "\n"))))

(defun ankidemy-org--new-list-prefix (list tail)
  "Return the portion pushed onto LIST before its previous TAIL."
  (let (items)
    (while (and list (not (eq list tail)))
      (push (car list) items)
      (setq list (cdr list)))
    (nreverse items)))

(defun ankidemy-org-clear-cache (&optional root)
  "Clear semantic cache for ROOT, or all roots when ROOT is nil."
  (if root
      (let ((normalized (file-name-as-directory (file-truename root))))
        (remhash normalized ankidemy-org--root-caches)
        (maphash (lambda (key _value)
                   (let ((file (if (consp key) (car key) key)))
                     (when (and (stringp file)
                                (file-in-directory-p file normalized))
                       (remhash key ankidemy-org--index-caches)
                       (remhash file ankidemy-org--lint-caches))))
                 (copy-hash-table ankidemy-org--index-caches)))
    (clrhash ankidemy-org--root-caches)
    (clrhash ankidemy-org--index-caches)
    (clrhash ankidemy-org--lint-caches)))

(defun ankidemy-org--merge-file-cache (context entry)
  "Prepend cached semantic records in ENTRY to CONTEXT."
  (setf (ankidemy-org--context-nodes context)
        (append (plist-get entry :nodes) (ankidemy-org--context-nodes context))
        (ankidemy-org--context-edges context)
        (append (plist-get entry :edges) (ankidemy-org--context-edges context))
        (ankidemy-org--context-assets context)
        (append (plist-get entry :assets) (ankidemy-org--context-assets context))
        (ankidemy-org--context-diagnostics context)
        (append (plist-get entry :diagnostics)
                (ankidemy-org--context-diagnostics context))))

(defun ankidemy-org--parse-file-cached (context file files-cache)
  "Parse FILE into CONTEXT or merge its entry from FILES-CACHE."
  (let* ((signature (ankidemy-org--file-signature file))
         (entry (gethash file files-cache)))
    (if (equal signature (plist-get entry :signature))
        (ankidemy-org--merge-file-cache context entry)
      (let ((old-nodes (ankidemy-org--context-nodes context))
            (old-edges (ankidemy-org--context-edges context))
            (old-assets (ankidemy-org--context-assets context))
            (old-diagnostics (ankidemy-org--context-diagnostics context)))
        (ankidemy-org--parse-file context file)
        (puthash file
                 (list :signature signature
                       :nodes (ankidemy-org--new-list-prefix
                               (ankidemy-org--context-nodes context) old-nodes)
                       :edges (ankidemy-org--new-list-prefix
                               (ankidemy-org--context-edges context) old-edges)
                       :assets (ankidemy-org--new-list-prefix
                                (ankidemy-org--context-assets context) old-assets)
                       :diagnostics (ankidemy-org--new-list-prefix
                                     (ankidemy-org--context-diagnostics context)
                                     old-diagnostics))
                 files-cache)))))

;;;###autoload
(defun ankidemy-org-parse-root (root)
  "Parse explicitly manifested Org notebook ROOT into a semantic snapshot plist."
  (let* ((discovery (ankidemy-org--discover root))
         (context (make-ankidemy-org--context
                   :root (plist-get discovery :root)
                   :files (plist-get discovery :files)
                   :external-notebooks (plist-get discovery :external-notebooks)
                   :local-ids (make-hash-table :test #'equal)
                   :excluded-ids (make-hash-table :test #'equal)
                   :external-ids (make-hash-table :test #'equal)
                   :evidence-counter 0
                   :diagnostics (copy-sequence (plist-get discovery :diagnostics)))))
    (dolist (file (ankidemy-org--context-files context))
      (setf (ankidemy-org--context-diagnostics context)
            (append (ankidemy-org--context-diagnostics context)
                    (ankidemy-org--lint-file-cached file)))
      (ankidemy-org--index-file context file))
    (ankidemy-org--index-external-notebooks context discovery)
    (let* ((root-key (ankidemy-org--context-root context))
           (root-cache (or (gethash root-key ankidemy-org--root-caches)
                           (list :files (make-hash-table :test #'equal))))
           (files-cache (plist-get root-cache :files))
           (index-signature
            (ankidemy-org--hash-table-signature
             (list (ankidemy-org--context-local-ids context)
                   (ankidemy-org--context-excluded-ids context)
                   (ankidemy-org--context-external-ids context)))))
      ;; Adding/removing/retyping an ID can change link resolution in otherwise
      ;; untouched files, so that rare structural case invalidates all records.
      (unless (equal index-signature (plist-get root-cache :index-signature))
        (setq files-cache (make-hash-table :test #'equal))
        (setq root-cache (plist-put root-cache :files files-cache)))
      (setq root-cache (plist-put root-cache :index-signature index-signature))
      (puthash root-key root-cache ankidemy-org--root-caches)
    (unless (cl-some (lambda (d) (string= (plist-get d :severity) "error"))
                     (ankidemy-org--context-diagnostics context))
      (dolist (file (ankidemy-org--context-files context))
          (ankidemy-org--parse-file-cached context file files-cache))))
    (let* ((diagnostics (nreverse (ankidemy-org--context-diagnostics context)))
           (complete (not (cl-some (lambda (d)
                                     (string= (plist-get d :severity) "error"))
                                   diagnostics)))
           (manifest (plist-get discovery :manifest)))
      (list :protocol-version 1 :provider "org-roam" :complete complete
            :notebook (and manifest
                           (list :provider-notebook-id (plist-get manifest :id)
                                 :schema (plist-get manifest :schema)
                                 :title (plist-get manifest :title)
                                 :root (ankidemy-org--context-root context)))
            :nodes (nreverse (ankidemy-org--context-nodes context))
            :edges (nreverse (ankidemy-org--context-edges context))
            :assets (nreverse (ankidemy-org--context-assets context))
            :external-notebooks (plist-get discovery :external-notebooks)
            :revision ""
            :diagnostics diagnostics))))

(defun ankidemy-org--camel-key (key)
  "Convert plist keyword KEY from kebab-case to lower camelCase."
  (let* ((parts (split-string (string-remove-prefix ":" (symbol-name key)) "-" t))
         (head (car parts)))
    (concat head (mapconcat #'capitalize (cdr parts) ""))))

(defun ankidemy-org--json-value (value)
  "Convert plist VALUE recursively into data accepted by `json-serialize'."
  (cond
   ((null value) nil)
   ((vectorp value) (vconcat (mapcar #'ankidemy-org--json-value value)))
   ((and (listp value) (keywordp (car-safe value)))
    (let (object)
      (while value
        (let ((key (pop value)) (item (pop value)))
          (push (cons (intern (ankidemy-org--camel-key key))
                      (ankidemy-org--json-value item))
                object)))
      (nreverse object)))
   ((listp value) (vconcat (mapcar #'ankidemy-org--json-value value)))
   ((eq value :json-null) nil)
   (t value)))

;;;###autoload
(defun ankidemy-org-snapshot-json (root)
  "Return semantic snapshot for ROOT as provider-protocol JSON."
  (let ((snapshot (ankidemy-org-parse-root root)))
    ;; Preserve the convenient nil predicate in the Lisp API while emitting a
    ;; proper JSON boolean rather than null on the wire.
    (unless (plist-get snapshot :complete)
      (setq snapshot (plist-put snapshot :complete :json-false)))
    (json-serialize (ankidemy-org--json-value snapshot)
                    :null-object nil :false-object :json-false)))

;;;###autoload
(defun ankidemy-org-lint-root (root)
  "Interactively lint manifested Org notebook ROOT and show diagnostics."
  (interactive "DOrg notebook root: ")
  (let* ((snapshot (ankidemy-org-parse-root root))
         (diagnostics (plist-get snapshot :diagnostics))
         (buffer (get-buffer-create "*Ankidemy Org diagnostics*")))
    (with-current-buffer buffer
      (setq buffer-read-only nil)
      (erase-buffer)
      (insert (format "Ankidemy Org lint: %s\n\n" (expand-file-name root)))
      (if diagnostics
          (dolist (diag diagnostics)
            (insert (format "%s %-36s %s:%s:%s\n  %s\n\n"
                            (upcase (plist-get diag :severity))
                            (plist-get diag :code)
                            (or (plist-get (plist-get diag :location) :file) "")
                            (or (plist-get (plist-get diag :location) :line) "")
                            (or (plist-get (plist-get diag :location) :column) "")
                            (plist-get diag :message))))
        (insert "No diagnostics. Snapshot is complete.\n"))
      (special-mode))
    (pop-to-buffer buffer)
    snapshot))

(provide 'ankidemy-org-import)
;;; ankidemy-org-import.el ends here
