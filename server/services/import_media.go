package services

import "strings"

// CollectImportMediaPaths returns unique, non-empty media paths referenced in import data.
func CollectImportMediaPaths(data *ImportData) []string {
	if data == nil {
		return nil
	}
	seen := make(map[string]struct{})
	add := func(path string) {
		trimmed := strings.TrimSpace(path)
		if trimmed == "" {
			return
		}
		seen[trimmed] = struct{}{}
	}

	for _, md := range data.MetaDefinitions {
		for _, v := range md.Versions {
			add(v.PromptImagePath)
			add(v.DescriptionImagePath)
		}
	}
	for _, me := range data.MetaExercises {
		for _, v := range me.Versions {
			add(v.StatementImagePath)
			add(v.DescriptionImagePath)
		}
	}
	for _, mq := range data.MetaQuests {
		for _, v := range mq.Versions {
			if v.ImagePath != nil {
				add(*v.ImagePath)
			}
		}
	}

	out := make([]string, 0, len(seen))
	for path := range seen {
		out = append(out, path)
	}
	return out
}

// RewriteImportMediaPaths updates media paths in place using the provided rewrite function.
func RewriteImportMediaPaths(data *ImportData, rewrite func(string) (string, error)) error {
	if data == nil {
		return nil
	}

	for code, md := range data.MetaDefinitions {
		for i := range md.Versions {
			if md.Versions[i].PromptImagePath != "" {
				next, err := rewrite(md.Versions[i].PromptImagePath)
				if err != nil {
					return err
				}
				md.Versions[i].PromptImagePath = next
			}
			if md.Versions[i].DescriptionImagePath != "" {
				next, err := rewrite(md.Versions[i].DescriptionImagePath)
				if err != nil {
					return err
				}
				md.Versions[i].DescriptionImagePath = next
			}
		}
		data.MetaDefinitions[code] = md
	}

	for code, me := range data.MetaExercises {
		for i := range me.Versions {
			if me.Versions[i].StatementImagePath != "" {
				next, err := rewrite(me.Versions[i].StatementImagePath)
				if err != nil {
					return err
				}
				me.Versions[i].StatementImagePath = next
			}
			if me.Versions[i].DescriptionImagePath != "" {
				next, err := rewrite(me.Versions[i].DescriptionImagePath)
				if err != nil {
					return err
				}
				me.Versions[i].DescriptionImagePath = next
			}
		}
		data.MetaExercises[code] = me
	}

	for code, mq := range data.MetaQuests {
		for i := range mq.Versions {
			if mq.Versions[i].ImagePath != nil && strings.TrimSpace(*mq.Versions[i].ImagePath) != "" {
				next, err := rewrite(*mq.Versions[i].ImagePath)
				if err != nil {
					return err
				}
				mq.Versions[i].ImagePath = &next
			}
		}
		data.MetaQuests[code] = mq
	}

	return nil
}
