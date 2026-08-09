;;; ankidemy-org-import-test.el --- Tests for Org adapter -*- lexical-binding: t; -*-

(require 'ert)
(require 'ankidemy-org-import)

(defconst ankidemy-org-test--repo-root
  (file-truename
   (expand-file-name "../../.." (file-name-directory
                                  (or load-file-name buffer-file-name)))))

(defconst ankidemy-org-test--technical-root
  (expand-file-name
   "docs/examples/org-roam-live-import/braindump/technical"
   ankidemy-org-test--repo-root))

(defconst ankidemy-org-test--invalid-root
  (expand-file-name
   "docs/examples/org-roam-live-import/braindump/technical-invalid"
   ankidemy-org-test--repo-root))

(defun ankidemy-org-test--node (snapshot id)
  "Return node ID from SNAPSHOT."
  (cl-find id (plist-get snapshot :nodes)
           :key (lambda (node) (plist-get node :source-id)) :test #'string=))

(defun ankidemy-org-test--diagnostic-codes (snapshot)
  "Return diagnostic codes from SNAPSHOT."
  (mapcar (lambda (diag) (plist-get diag :code))
          (plist-get snapshot :diagnostics)))

(defun ankidemy-org-test--temp-notebook (files)
  "Create and return temporary manifested notebook containing FILES alist."
  (let ((root (make-temp-file "ankidemy-org-test-" t)))
    (with-temp-file (expand-file-name "ankidemy.org" root)
      (insert "#+title: Temporary fixture\n"
              "#+ankidemy_notebook_id: temporary-fixture\n"
              "#+ankidemy_schema: 1\n"))
    (dolist (entry files)
      (let ((file (expand-file-name (car entry) root)))
        (make-directory (file-name-directory file) t)
        (with-temp-file file (insert (cdr entry)))))
    root))

(ert-deftest ankidemy-org-parse-technical-fixture ()
  (let ((snapshot (ankidemy-org-parse-root ankidemy-org-test--technical-root)))
    (should (plist-get snapshot :complete))
    (should (= 7 (length (plist-get snapshot :nodes))))
    (should (ankidemy-org-test--node snapshot "technical-bayes"))
    (should-not (ankidemy-org-test--node snapshot "technical-empty-index"))
    (should-not (ankidemy-org-test--node snapshot "research-external-node"))
    (should (= 1 (length (plist-get snapshot :external-notebooks))))
    (should (equal "fixture-research-notebook"
                   (plist-get (car (plist-get snapshot :external-notebooks))
                              :provider-notebook-id)))))

(ert-deftest ankidemy-org-normalizes-xenops-math-and-owns-image ()
  (let* ((snapshot (ankidemy-org-parse-root ankidemy-org-test--technical-root))
         (node (ankidemy-org-test--node snapshot "technical-pythagoras"))
         (version (car (plist-get (plist-get node :definition) :versions)))
         (description (plist-get version :description-md))
         (notes (plist-get version :notes-md))
         (asset (car (plist-get snapshot :assets))))
    (should (string-match-p (regexp-quote "$a^2+b^2=c^2$") description))
    (should (string-match-p (regexp-quote "$$c=\\sqrt{a^2+b^2}.$$") description))
    (should (string-match-p (regexp-quote "$$\n\\begin{align}") description))
    (should (string-match-p (regexp-quote "\\end{align}\n$$") description))
    (should (string= "technical-pythagoras-v1"
                     (plist-get asset :owner-source-id)))
    (should (string= "notesMd" (plist-get asset :owner-field)))
    (should (string= "image/svg+xml" (plist-get asset :mime)))
    (should (string-match-p
             (regexp-quote (concat "asset:" (plist-get asset :id))) notes))
    (should-not (string-match-p (regexp-quote ankidemy-org-test--repo-root) notes))))

(ert-deftest ankidemy-org-maps-todo-daily-and-habit ()
  (let ((snapshot (ankidemy-org-parse-root ankidemy-org-test--technical-root)))
    (dolist (expected '(("technical-quest-todo" "todo" "rrule" nil)
                        ("technical-quest-daily" "daily" "daily_pool" "+")
                        ("technical-quest-habit" "habit" "habit" ".+")))
      (let* ((node (ankidemy-org-test--node snapshot (nth 0 expected)))
             (quest (plist-get node :quest)))
        (should (string= (nth 1 expected) (plist-get quest :kind)))
        (should (string= (nth 2 expected)
                         (plist-get (plist-get quest :schedule) :type)))
        (should (equal (nth 3 expected) (plist-get quest :org-repeater-mode)))))))

(ert-deftest ankidemy-org-distinguishes-inactive-and-catch-up-timestamps ()
  (let* ((root (ankidemy-org-test--temp-notebook
                `(("quests.org" .
                   ,(concat
                     "#+title: Quest syntax\n\n"
                     "* TODO Inactive\n"
                     "SCHEDULED: [2026-07-15 Wed 09:00]\n"
                     ":PROPERTIES:\n:ID: inactive-quest\n:END:\n\n"
                     "* Inactive without TODO\n"
                     "SCHEDULED: [2026-07-16 Thu 09:00]\n"
                     ":PROPERTIES:\n:ID: inactive-no-todo\n:END:\n\n"
                     "* TODO Catch up\n"
                     "SCHEDULED: <2026-07-15 Wed 09:00 ++2d>\n"
                     ":PROPERTIES:\n:ID: catch-up-quest\n:END:\n")))))
         (snapshot (unwind-protect (ankidemy-org-parse-root root)
                     (delete-directory root t))))
    (should-not (plist-get snapshot :complete))
    (should (member "quest.timestamp_inactive"
                    (ankidemy-org-test--diagnostic-codes snapshot)))
    (should (ankidemy-org-test--node snapshot "inactive-no-todo"))
    (let ((quest (plist-get (ankidemy-org-test--node snapshot "catch-up-quest")
                            :quest)))
      (should (string= "habit" (plist-get quest :kind)))
      (should (string= "++" (plist-get quest :org-repeater-mode)))
      (should (string= "++" (plist-get (plist-get quest :schedule)
                                        :org-repeater-mode)))
      (should (string-match-p "2026-07-15T09:00:00"
                              (plist-get (plist-get quest :schedule) :dtstart)))
      (should (string= "FREQ=DAILY;INTERVAL=2"
                       (plist-get (plist-get quest :schedule) :rrule))))))

(ert-deftest ankidemy-org-preserves-daily-start-time-and-catch-up-mode ()
  (let* ((ankidemy-org-timezone "America/Mexico_City")
         (root (ankidemy-org-test--temp-notebook
                '(("daily.org" .
                   "* TODO Daily at seven\nSCHEDULED: <2026-07-19 Sun 07:00 ++1d>\n:PROPERTIES:\n:ID: daily-at-seven\n:ANKIDEMY_TYPE: quest\n:END:\n"))))
         (snapshot (unwind-protect (ankidemy-org-parse-root root)
                     (delete-directory root t)))
         (quest (plist-get (ankidemy-org-test--node snapshot "daily-at-seven")
                           :quest))
         (schedule (plist-get quest :schedule)))
    (should (plist-get snapshot :complete))
    (should (string= "daily" (plist-get quest :kind)))
    (should (string= "daily_pool" (plist-get schedule :type)))
    (should (string= "2026-07-19T07:00:00-06:00" (plist-get schedule :dtstart)))
    (should (string= "FREQ=DAILY;INTERVAL=1" (plist-get schedule :rrule)))
    (should (string= "++" (plist-get schedule :org-repeater-mode)))
    (should (string-empty-p (plist-get quest :description-md)))))

(ert-deftest ankidemy-org-quest-description-excludes-structural-metadata ()
  (let* ((root (ankidemy-org-test--temp-notebook
                '(("details.org" .
                   "* TODO Quest details\nSCHEDULED: <2026-07-19 Sun 07:00 ++1d>\n:PROPERTIES:\n:ID: quest-details\n:ANKIDEMY_TYPE: quest\n:END:\nPlain text details.\n"))))
         (snapshot (unwind-protect (ankidemy-org-parse-root root)
                     (delete-directory root t)))
         (quest (plist-get (ankidemy-org-test--node snapshot "quest-details")
                           :quest))
         (description (plist-get quest :description-md)))
    (should (plist-get snapshot :complete))
    (should (string= "Plain text details." description))
    (should-not (string-match-p "SCHEDULED" description))
    (should-not (string-match-p "ANKIDEMY_TYPE" description))
    (should-not (string-match-p "quest-details" description))))

(ert-deftest ankidemy-org-forces-daily-repeater-to-habit-and-parses-versions ()
  (let* ((ankidemy-org-timezone "America/Mexico_City")
         (root (ankidemy-org-test--temp-notebook
                '(("versioned-habit.org" .
                   "* TODO Do Not Overthink :habit:\nSCHEDULED: <2026-07-19 Sun 07:00 ++1d>\n:PROPERTIES:\n:ID: versioned-habit\n:ANKIDEMY_TYPE: quest\n:END:\n** Notice the urge :version:\n:PROPERTIES:\n:ID: versioned-habit-a\n:ROAM_EXCLUDE: t\n:END:\nPause before acting.\n** Use a timer :version:\n:PROPERTIES:\n:ID: versioned-habit-b\n:ROAM_EXCLUDE: t\n:END:\nWait two minutes.\n"))))
         (snapshot (unwind-protect (ankidemy-org-parse-root root)
                     (delete-directory root t)))
         (quest (plist-get (ankidemy-org-test--node snapshot "versioned-habit")
                           :quest))
         (schedule (plist-get quest :schedule))
         (versions (plist-get quest :versions)))
    (should (plist-get snapshot :complete))
    (should (string= "habit" (plist-get quest :kind)))
    (should (string= "habit" (plist-get schedule :type)))
    (should (string= "FREQ=DAILY;INTERVAL=1" (plist-get schedule :rrule)))
    (should (= 2 (length versions)))
    (should (equal '("versioned-habit-a" "versioned-habit-b")
                   (mapcar (lambda (version) (plist-get version :source-id))
                           versions)))
    (should (equal '("Notice the urge" "Use a timer")
                   (mapcar (lambda (version) (plist-get version :title))
                           versions)))
    (should (string= "Pause before acting."
                     (plist-get (car versions) :description-md)))
    (should (string= "Wait two minutes."
                     (plist-get (cadr versions) :description-md)))))

(ert-deftest ankidemy-org-uses-reference-direction-for-sources-and-quests ()
  (let* ((root (ankidemy-org-test--temp-notebook
                '(("links.org" .
                   "* Parent source\n:PROPERTIES:\n:ID: parent-source\n:ANKIDEMY_TYPE: source\n:END:\n** TODO Child quest\nSCHEDULED: <2026-07-19 Sun 07:00 ++1d>\n:PROPERTIES:\n:ID: child-quest\n:ANKIDEMY_TYPE: quest\n:END:\n[[id:target-source][target]]\n* Linking source\n:PROPERTIES:\n:ID: linking-source\n:ANKIDEMY_TYPE: source\n:END:\n[[id:target-source][target]]\n* Target source\n:PROPERTIES:\n:ID: target-source\n:ANKIDEMY_TYPE: source\n:END:\n"))))
         (snapshot (unwind-protect (ankidemy-org-parse-root root)
                     (delete-directory root t)))
         (edges (plist-get snapshot :edges)))
    (should (plist-get snapshot :complete))
    (dolist (expected '(("child-quest" "parent-source" "hierarchy")
                        ("child-quest" "target-source" "link")
                        ("linking-source" "target-source" "link")))
      (should (cl-find-if
               (lambda (edge)
                 (and (string= (nth 0 expected) (plist-get edge :from-source-id))
                      (string= (nth 1 expected) (plist-get edge :to-source-id))
                      (string= (nth 2 expected) (plist-get edge :evidence))))
               edges)))))

(ert-deftest ankidemy-org-resolves-nested-source-link-as-external-to-endpoint ()
  (let* ((snapshot (ankidemy-org-parse-root ankidemy-org-test--technical-root))
         (edge (cl-find-if
                (lambda (item)
                  (plist-get item :to-external-provider-notebook-id))
                (plist-get snapshot :edges))))
    (should edge)
    (should (string= "fixture-research-notebook"
                     (plist-get edge :to-external-provider-notebook-id)))
    (should (string= "research-external-node"
                     (plist-get edge :to-external-source-id)))
    (should (string= "technical-research-handoff"
                     (plist-get edge :from-source-id)))))

(ert-deftest ankidemy-org-malformed-file-is-actionable-and-atomic ()
  (let* ((snapshot (ankidemy-org-parse-root ankidemy-org-test--invalid-root))
         (diagnostic (car (plist-get snapshot :diagnostics))))
    (should-not (plist-get snapshot :complete))
    (should-not (plist-get snapshot :nodes))
    (should (string= "file.parse_failed" (plist-get diagnostic :code)))
    (should (string-suffix-p "broken-property-drawer.org"
                             (plist-get (plist-get diagnostic :location) :file)))
    (should (= 4 (plist-get (plist-get diagnostic :location) :line)))))

(ert-deftest ankidemy-org-reports-property-drawer-after-node-body ()
  (let* ((root (ankidemy-org-test--temp-notebook
                '(("late-drawer.org" .
                   "* Definition\n:PROPERTIES:\n:ID: definition-id\n:ANKIDEMY_TYPE: definition\n:END:\n** Prompt :version:\nAnswer before metadata.\n:PROPERTIES:\n:ID: version-id\n:ROAM_EXCLUDE: t\n:END:\n"))))
         (snapshot (unwind-protect (ankidemy-org-parse-root root)
                     (delete-directory root t)))
         (diagnostic (cl-find "property_drawer.misplaced"
                              (plist-get snapshot :diagnostics)
                              :key (lambda (item) (plist-get item :code))
                              :test #'string=)))
    (should-not (plist-get snapshot :complete))
    (should-not (plist-get snapshot :nodes))
    (should diagnostic)
    (should (= 8 (plist-get (plist-get diagnostic :location) :line)))))

(ert-deftest ankidemy-org-requires-explicit-manifest ()
  (let ((root (make-temp-file "ankidemy-org-unattached-" t)))
    (unwind-protect
        (progn
          (with-temp-file (expand-file-name "note.org" root)
            (insert "* Note\n:PROPERTIES:\n:ID: unattached-note\n:END:\n"))
          (let ((snapshot (ankidemy-org-parse-root root)))
            (should-not (plist-get snapshot :complete))
            (should (member "manifest.missing"
                            (ankidemy-org-test--diagnostic-codes snapshot)))))
      (delete-directory root t))))

(ert-deftest ankidemy-org-json-uses-provider-protocol-camel-case ()
  (let ((json (ankidemy-org-snapshot-json ankidemy-org-test--technical-root)))
    (should (string-match-p (regexp-quote "\"protocolVersion\":1") json))
    (should (string-match-p (regexp-quote "\"providerNotebookId\":\"fixture-technical-notebook\"") json))
    (should (string-match-p (regexp-quote "\"toExternalProviderNotebookId\":\"fixture-research-notebook\"") json))
    (should-not (string-match-p (regexp-quote "protocol-version") json))))

(ert-deftest ankidemy-org-json-returns-printable-utf-8-text ()
  (let ((root (ankidemy-org-test--temp-notebook
               '(("unicode.org" .
                  "* Résumé guidance\n:PROPERTIES:\n:ID: unicode-source\n:END:\nKeep résumé wording concise.\n")))))
    (unwind-protect
        (let ((json (ankidemy-org-snapshot-json root)))
          (should (multibyte-string-p json))
          (should (string-match-p (regexp-quote "Résumé guidance") json))
          (should (string-match-p (regexp-quote "résumé wording") json)))
      (delete-directory root t))))

(ert-deftest ankidemy-org-rejects-malformed-latex-before-emitting-nodes ()
  (let* ((root (ankidemy-org-test--temp-notebook
                '(("math.org" .
                   "* Broken math\n:PROPERTIES:\n:ID: broken-math\n:END:\n\\[x+1\n"))))
         (snapshot (unwind-protect (ankidemy-org-parse-root root)
                     (delete-directory root t))))
    (should-not (plist-get snapshot :complete))
    (should-not (plist-get snapshot :nodes))
    (should (member "latex.malformed"
                    (ankidemy-org-test--diagnostic-codes snapshot)))))

(ert-deftest ankidemy-org-supports-file-level-source-node ()
  (let* ((root (ankidemy-org-test--temp-notebook
                '(("source.org" .
                   ":PROPERTIES:\n:ID: file-source\n:END:\n#+title: File source\n\nOwned body.\n\n* Child\n:PROPERTIES:\n:ID: file-child\n:ANKIDEMY_TYPE: source\n:END:\nChild body.\n"))))
         (snapshot (unwind-protect (ankidemy-org-parse-root root)
                     (delete-directory root t)))
         (source (ankidemy-org-test--node snapshot "file-source")))
    (should (plist-get snapshot :complete))
    (should source)
    (should (string= "Owned body." (plist-get (plist-get source :source) :content-md)))
    (should (cl-find-if (lambda (edge)
                          (and (string= "file-source" (plist-get edge :from-source-id))
                               (string= "file-child" (plist-get edge :to-source-id))))
                        (plist-get snapshot :edges)))))

(ert-deftest ankidemy-org-does-not-mistake-first-heading-for-file-node ()
  (let* ((root (ankidemy-org-test--temp-notebook
                '(("untitled.org" .
                   "* First heading\n:PROPERTIES:\n:ID: first-heading\n:END:\nBody.\n"))))
         (snapshot (unwind-protect (ankidemy-org-parse-root root)
                     (delete-directory root t))))
    (should (plist-get snapshot :complete))
    (should (= 1 (length (plist-get snapshot :nodes))))
    (should (ankidemy-org-test--node snapshot "first-heading"))))

(ert-deftest ankidemy-org-parses-in-anonymous-buffers ()
  (let* ((root (ankidemy-org-test--temp-notebook
                '(("note.org" .
                   "* Note\n:PROPERTIES:\n:ID: anonymous-buffer-note\n:END:\nBody.\n"))))
         (org-mode-hook
          (list (lambda ()
                  (when buffer-file-name
                    (error "Importer exposed a real file buffer to org-mode hooks")))))
         (snapshot (unwind-protect (ankidemy-org-parse-root root)
                     (delete-directory root t))))
    (should (plist-get snapshot :complete))
    (should (ankidemy-org-test--node snapshot "anonymous-buffer-note"))))

(ert-deftest ankidemy-org-semantic-cache-reparses-only-changed-file ()
  (let* ((root (ankidemy-org-test--temp-notebook
                '(("one.org" .
                   "* One\n:PROPERTIES:\n:ID: cache-one\n:END:\nOne body.\n")
                  ("two.org" .
                   "* Two\n:PROPERTIES:\n:ID: cache-two\n:END:\nTwo body.\n"))))
         (calls 0)
         (original (symbol-function 'ankidemy-org--parse-file)))
    (unwind-protect
        (cl-letf (((symbol-function 'ankidemy-org--parse-file)
                   (lambda (context file)
                     (setq calls (1+ calls))
                     (funcall original context file))))
          (ankidemy-org-clear-cache root)
          (ankidemy-org-parse-root root)
          (should (= calls 2))
          (setq calls 0)
          (ankidemy-org-parse-root root)
          (should (= calls 0))
          (with-temp-buffer
            (insert-file-contents (expand-file-name "two.org" root))
            (goto-char (point-max))
            (insert "Saved change.\n")
            (write-region (point-min) (point-max)
                          (expand-file-name "two.org" root) nil 'silent))
          (ankidemy-org-parse-root root)
          (should (= calls 1)))
      (ankidemy-org-clear-cache root)
      (delete-directory root t))))

(provide 'ankidemy-org-import-test)
;;; ankidemy-org-import-test.el ends here
