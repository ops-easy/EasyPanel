package harbor

import (
	"net/url"
	"strings"
	"unicode/utf8"
)

func MaskURL(raw string) string {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || u.Scheme == "" || u.Host == "" {
		return ""
	}
	return u.Scheme + "://" + u.Host + "/..."
}

func RegistryPullHost(baseURL string) string {
	u, err := url.Parse(strings.TrimSpace(baseURL))
	if err != nil || u.Host == "" {
		return ""
	}
	return u.Host
}

func NormalizeRepositoryForProject(project, repo string) string {
	project = strings.Trim(strings.TrimSpace(project), "/")
	repo = strings.Trim(strings.TrimSpace(repo), "/")
	if project == "" || repo == "" {
		return repo
	}
	if repo == project {
		return repo
	}
	prefix := project + "/"
	if strings.HasPrefix(repo, prefix) {
		return strings.TrimPrefix(repo, prefix)
	}
	return repo
}

func RepositoryPathSegmentCandidates(repoRelative string) []string {
	repoRelative = strings.Trim(strings.TrimSpace(repoRelative), "/")
	if repoRelative == "" {
		return nil
	}
	once := url.PathEscape(repoRelative)
	if !strings.Contains(repoRelative, "/") {
		return []string{once}
	}
	return []string{once, url.PathEscape(once)}
}

func LooksLikeDockerTag(tag string) bool {
	tag = strings.TrimSpace(tag)
	if tag == "" {
		return false
	}
	for _, r := range tag {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '.' || r == '_' || r == '-' {
			continue
		}
		return false
	}
	return true
}

func IsColonRune(r rune) bool {
	return r == ':' || r == '：'
}

func TrimTrailingColons(s string) string {
	s = strings.TrimSpace(s)
	for len(s) > 0 {
		r, sz := utf8.DecodeLastRuneInString(s)
		if !IsColonRune(r) {
			break
		}
		s = strings.TrimSpace(s[:len(s)-sz])
	}
	return strings.TrimSpace(s)
}

func LastColonIndex(s string) int {
	last := -1
	for i := 0; i < len(s); {
		r, sz := utf8.DecodeRuneInString(s[i:])
		if IsColonRune(r) {
			last = i
		}
		i += sz
	}
	return last
}

func SanitizeRepositoryListQ(raw string) string {
	s := strings.TrimSpace(raw)
	if s == "" {
		return ""
	}
	s = TrimTrailingColons(s)
	if s == "" {
		return ""
	}
	if i := LastColonIndex(s); i > 0 {
		_, colonSz := utf8.DecodeRuneInString(s[i:])
		rhs := strings.TrimSpace(s[i+colonSz:])
		if rhs != "" && !strings.Contains(rhs, "/") && LooksLikeDockerTag(rhs) {
			s = strings.TrimSpace(s[:i])
		}
	}
	return strings.TrimSpace(s)
}

func ResolvePublicUIURL(baseURL string, systeminfo map[string]any) string {
	if systeminfo != nil {
		raw, _ := systeminfo["external_url"].(string)
		raw = strings.TrimSpace(raw)
		if raw != "" {
			if u, err := url.Parse(raw); err == nil && u.Host != "" && (u.Scheme == "http" || u.Scheme == "https") {
				u.Fragment = ""
				u.RawQuery = ""
				s := strings.TrimRight(u.String(), "/")
				if s != "" {
					return s
				}
			}
		}
	}
	return strings.TrimSuffix(strings.TrimSpace(baseURL), "/")
}

func ImageReference(host, project, repo, tag string) string {
	host = strings.TrimSpace(host)
	project = strings.Trim(strings.TrimSpace(project), "/")
	repo = strings.Trim(strings.TrimSpace(repo), "/")
	tag = strings.TrimSpace(tag)
	if host == "" || project == "" || repo == "" {
		return ""
	}
	if tag == "" {
		return host + "/" + project + "/" + repo
	}
	if strings.HasPrefix(tag, "sha256:") {
		return host + "/" + project + "/" + repo + "@" + tag
	}
	return host + "/" + project + "/" + repo + ":" + tag
}
