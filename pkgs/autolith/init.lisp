(in-package #:autolith)

;; Autolith 0.47.1 rejects Home Manager skill links into /nix/store.
;; Remove this override when upstream supports these user-installed links.
(defun skill-catalog-for-configuration (configuration)
  "Discover skills, admitting Nix targets linked from the user skill root."
  (let* ((roots (skill-roots configuration))
         (user-root (merge-pathnames "skills/"
                                     (configuration-config-root configuration)))
         (cache-root (configuration-cache-root configuration))
         (catalog (skill-catalog-discover roots :cache-root cache-root))
         (nix-root (ignore-errors (truename #P"/nix/store/")))
         (target-roots
           (and nix-root
                (remove-duplicates
                 (loop for diagnostic in (skill-catalog-diagnostics catalog)
                       for pathname = (skill-diagnostic-pathname diagnostic)
                       for target =
                         (and (eq (skill-diagnostic-kind diagnostic) :outside-root)
                              pathname
                              (uiop:subpathp pathname user-root)
                              (ignore-errors (truename pathname)))
                       when (and target (uiop:subpathp target nix-root))
                         collect
                           (if (uiop:directory-pathname-p target)
                               (uiop:ensure-directory-pathname target)
                               (uiop:pathname-directory-pathname target)))
                 :test #'uiop:pathname-equal))))
    (if (null target-roots)
        catalog
        (let* ((root-count (length roots))
               (expanded-catalog
                 (skill-catalog-discover (append roots target-roots)
                                         :cache-root cache-root)))
          ;; Extra roots grant read access. Do not expose their separate scans.
          (make-instance
           'skill-catalog
           :skills
           (remove-if
            (lambda (metadata)
              (>= (cl-skills:skill-metadata-root-index metadata) root-count))
            (skill-catalog-skills expanded-catalog))
           :diagnostics
           (remove-if
            (lambda (diagnostic)
              (>= (skill-diagnostic-root-index diagnostic) root-count))
            (skill-catalog-diagnostics expanded-catalog)))))))
