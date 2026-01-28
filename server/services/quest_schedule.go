package services

import (
	"encoding/json"
	"errors"
	"math"
	"sort"
	"strconv"
	"strings"
	"time"
)

type BaseSchedule struct {
	Type string `json:"type"`
}

type RRuleSchedule struct {
	Type                 string   `json:"type"`
	Timezone             string   `json:"timezone"`
	Dtstart              string   `json:"dtstart"`
	RRule                string   `json:"rrule"`
	Exdate               []string `json:"exdate"`
	Rdate                []string `json:"rdate"`
	DefaultSnoozeMinutes int      `json:"defaultSnoozeMinutes"`
}

type HabitSchedule struct {
	Type                               string `json:"type"`
	Timezone                           string `json:"timezone"`
	Dtstart                            string `json:"dtstart"`
	RRule                              string `json:"rrule"`
	RequiredCompletionsPerPeriod       int    `json:"requiredCompletionsPerPeriod"`
	Period                             string `json:"period"`
	ConsecutivePeriodsToAutoDeactivate int    `json:"consecutivePeriodsToAutoDeactivate"`
}

type DailyPoolSchedule struct {
	Type                 string `json:"type"`
	Timezone             string `json:"timezone"`
	CooldownDaysOverride *int   `json:"cooldownDaysOverride"`
}

func parseScheduleType(raw json.RawMessage) (string, error) {
	var base BaseSchedule
	if err := json.Unmarshal(raw, &base); err != nil {
		return "", err
	}
	if base.Type == "" {
		return "", errors.New("schedule type missing")
	}
	return base.Type, nil
}

func parseRRuleSchedule(raw json.RawMessage) (*RRuleSchedule, error) {
	var sched RRuleSchedule
	if err := json.Unmarshal(raw, &sched); err != nil {
		return nil, err
	}
	return &sched, nil
}

func parseHabitSchedule(raw json.RawMessage) (*HabitSchedule, error) {
	var sched HabitSchedule
	if err := json.Unmarshal(raw, &sched); err != nil {
		return nil, err
	}
	return &sched, nil
}

func parseDailySchedule(raw json.RawMessage) (*DailyPoolSchedule, error) {
	var sched DailyPoolSchedule
	if err := json.Unmarshal(raw, &sched); err != nil {
		return nil, err
	}
	return &sched, nil
}

func parseScheduleTime(value string, loc *time.Location) (time.Time, error) {
	if value == "" {
		return time.Time{}, errors.New("dtstart missing")
	}
	if t, err := time.Parse(time.RFC3339, value); err == nil {
		return t.In(loc), nil
	}
	layout := "2006-01-02T15:04:05"
	if t, err := time.ParseInLocation(layout, value, loc); err == nil {
		return t, nil
	}
	return time.Time{}, errors.New("invalid dtstart")
}

type rruleSpec struct {
	freq     string
	byday    []time.Weekday
	byhour   []int
	byminute []int
	count    int
	until    *time.Time
}

func parseRRuleSpec(rrule string) rruleSpec {
	spec := rruleSpec{}
	parts := strings.Split(rrule, ";")
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		kv := strings.SplitN(part, "=", 2)
		if len(kv) != 2 {
			continue
		}
		key := strings.ToUpper(strings.TrimSpace(kv[0]))
		val := strings.TrimSpace(kv[1])
		switch key {
		case "FREQ":
			spec.freq = strings.ToUpper(val)
		case "BYDAY":
			days := strings.Split(val, ",")
			for _, d := range days {
				switch strings.ToUpper(strings.TrimSpace(d)) {
				case "MO":
					spec.byday = append(spec.byday, time.Monday)
				case "TU":
					spec.byday = append(spec.byday, time.Tuesday)
				case "WE":
					spec.byday = append(spec.byday, time.Wednesday)
				case "TH":
					spec.byday = append(spec.byday, time.Thursday)
				case "FR":
					spec.byday = append(spec.byday, time.Friday)
				case "SA":
					spec.byday = append(spec.byday, time.Saturday)
				case "SU":
					spec.byday = append(spec.byday, time.Sunday)
				}
			}
		case "BYHOUR":
			items := strings.Split(val, ",")
			for _, item := range items {
				if n, err := strconv.Atoi(strings.TrimSpace(item)); err == nil {
					spec.byhour = append(spec.byhour, n)
				}
			}
		case "BYMINUTE":
			items := strings.Split(val, ",")
			for _, item := range items {
				if n, err := strconv.Atoi(strings.TrimSpace(item)); err == nil {
					spec.byminute = append(spec.byminute, n)
				}
			}
		case "COUNT":
			if n, err := strconv.Atoi(strings.TrimSpace(val)); err == nil {
				spec.count = n
			}
		case "UNTIL":
			parsed := parseUntilValue(val)
			if !parsed.IsZero() {
				spec.until = &parsed
			}
		}
	}
	return spec
}

func parseUntilValue(value string) time.Time {
	value = strings.TrimSpace(value)
	if value == "" {
		return time.Time{}
	}
	if t, err := time.Parse(time.RFC3339, value); err == nil {
		return t
	}
	if t, err := time.Parse("20060102T150405Z", value); err == nil {
		return t
	}
	if t, err := time.Parse("20060102", value); err == nil {
		return t
	}
	return time.Time{}
}

func uniqueInts(values []int) []int {
	seen := map[int]bool{}
	out := make([]int, 0, len(values))
	for _, v := range values {
		if !seen[v] {
			seen[v] = true
			out = append(out, v)
		}
	}
	sort.Ints(out)
	return out
}

func nextOccurrence(spec rruleSpec, dtstart time.Time, after time.Time, exdates []time.Time, rdates []time.Time) *time.Time {
	loc := dtstart.Location()
	afterLocal := after.In(loc)
	if len(spec.byhour) == 0 {
		spec.byhour = []int{dtstart.Hour()}
	}
	if len(spec.byminute) == 0 {
		spec.byminute = []int{dtstart.Minute()}
	}
	spec.byhour = uniqueInts(spec.byhour)
	spec.byminute = uniqueInts(spec.byminute)

	exclude := map[int64]bool{}
	for _, ex := range exdates {
		exclude[ex.In(loc).Unix()] = true
	}

	// Consider rdates explicitly
	var candidate *time.Time
	for _, rd := range rdates {
		rdLocal := rd.In(loc)
		if rdLocal.After(afterLocal) {
			if candidate == nil || rdLocal.Before(*candidate) {
				copy := rdLocal
				candidate = &copy
			}
		}
	}

	if spec.count == 1 {
		occ := dtstart.In(loc)
		if occ.After(afterLocal) && !exclude[occ.Unix()] {
			return &occ
		}
		return candidate
	}

	startDate := time.Date(afterLocal.Year(), afterLocal.Month(), afterLocal.Day(), 0, 0, 0, 0, loc)
	maxDays := 365 * 5
	occurrences := 0
	for i := 0; i < maxDays; i++ {
		day := startDate.AddDate(0, 0, i)
		if spec.freq == "WEEKLY" && len(spec.byday) > 0 {
			match := false
			for _, wd := range spec.byday {
				if day.Weekday() == wd {
					match = true
					break
				}
			}
			if !match {
				continue
			}
		}
		for _, h := range spec.byhour {
			for _, m := range spec.byminute {
				occ := time.Date(day.Year(), day.Month(), day.Day(), h, m, 0, 0, loc)
				if occ.Before(dtstart) {
					continue
				}
				if spec.until != nil && occ.After(*spec.until) {
					return candidate
				}
				if !occ.After(afterLocal) {
					continue
				}
				if exclude[occ.Unix()] {
					continue
				}
				occurrences++
				if spec.count > 0 && occurrences > spec.count {
					return candidate
				}
				if candidate != nil && candidate.Before(occ) {
					return candidate
				}
				return &occ
			}
		}
	}

	return candidate
}

func parseDateList(values []string, loc *time.Location) []time.Time {
	out := make([]time.Time, 0, len(values))
	for _, v := range values {
		v = strings.TrimSpace(v)
		if v == "" {
			continue
		}
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			out = append(out, t.In(loc))
			continue
		}
		if t, err := time.ParseInLocation("2006-01-02T15:04:05", v, loc); err == nil {
			out = append(out, t)
		}
	}
	return out
}

func coalesceTimezone(value string) string {
	if strings.TrimSpace(value) == "" {
		return "UTC"
	}
	return value
}

func daysBetween(a time.Time, b time.Time) int {
	aa := time.Date(a.Year(), a.Month(), a.Day(), 0, 0, 0, 0, a.Location())
	bb := time.Date(b.Year(), b.Month(), b.Day(), 0, 0, 0, 0, b.Location())
	diff := bb.Sub(aa).Hours() / 24
	return int(math.Round(diff))
}
