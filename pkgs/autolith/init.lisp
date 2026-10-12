(in-package #:autolith)

;; Autolith 0.63.0 rejects Home Manager skill links into /nix/store.
;; Remove this override when upstream supports these user-installed links.
(defun skill-catalog-for-configuration (configuration)
  "Discover skills, admitting Nix targets linked from the user skill root."
  (let* ((roots (skill-roots configuration))
         (user-root (merge-pathnames "skills/" (config :config-root configuration)))
         (cache-root (config :cache-root configuration))
         (root-count (length roots))
         (catalog (skill-catalog-discover roots :cache-root cache-root))
         (nix-root (ignore-errors (truename #P"/nix/store/")))
         (target-roots nil))
    ;; A Home Manager directory can itself contain links into another store
    ;; path. Admit each newly reported target, not the whole Nix store.
    (when nix-root
      (loop
        for additions =
          (remove-duplicates
           (loop for diagnostic in (skill-catalog-diagnostics catalog)
                 for pathname = (skill-diagnostic-pathname diagnostic)
                 for target =
                   (and (eq (skill-diagnostic-kind diagnostic) :outside-root)
                        pathname
                        (< (skill-diagnostic-root-index diagnostic) root-count)
                        (uiop:subpathp pathname user-root)
                        (ignore-errors (truename pathname)))
                 for target-root =
                   (and target (uiop:subpathp target nix-root)
                        (if (uiop:directory-pathname-p target)
                            (uiop:ensure-directory-pathname target)
                            (uiop:pathname-directory-pathname target)))
                 when (and target-root
                           (not (member target-root target-roots
                                        :test #'uiop:pathname-equal)))
                   collect target-root)
           :test #'uiop:pathname-equal)
        while additions
        do (setf target-roots (append target-roots additions)
                 catalog (skill-catalog-discover (append roots target-roots)
                                                  :cache-root cache-root))))
    ;; Extra roots grant read access. Do not expose their separate scans.
    (make-instance
     'skill-catalog
     :skills
     (remove-if
      (lambda (metadata)
        (>= (cl-skills:skill-metadata-root-index metadata) root-count))
      (skill-catalog-skills catalog))
     :diagnostics
     (remove-if
      (lambda (diagnostic)
        (>= (skill-diagnostic-root-index diagnostic) root-count))
      (skill-catalog-diagnostics catalog)))))
