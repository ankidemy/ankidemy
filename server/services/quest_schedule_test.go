package services

import (
	"testing"
	"time"
)

func TestOrgRepeaterModesPreserveStrictCatchUpAndFromTodaySemantics(t *testing.T) {
	loc, err := time.LoadLocation("America/Mexico_City")
	if err != nil {
		t.Fatal(err)
	}
	dtstart := time.Date(2026, 7, 15, 7, 0, 0, 0, loc)
	previousDue := dtstart
	completed := time.Date(2026, 8, 1, 18, 30, 0, 0, loc)
	spec := parseRRuleSpec("FREQ=WEEKLY;INTERVAL=1")

	tests := []struct {
		name string
		mode string
		want time.Time
	}{
		{
			name: "strict shift advances exactly one authored period",
			mode: "+",
			want: time.Date(2026, 7, 22, 7, 0, 0, 0, loc),
		},
		{
			name: "catch-up shift advances to the next fixed weekday",
			mode: "++",
			want: time.Date(2026, 8, 5, 7, 0, 0, 0, loc),
		},
		{
			name: "from-today shift uses the completion date",
			mode: ".+",
			want: time.Date(2026, 8, 8, 7, 0, 0, 0, loc),
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got := nextScheduledOccurrence(spec, dtstart, completed, &previousDue, test.mode, nil, nil)
			if got == nil || !got.Equal(test.want) {
				t.Fatalf("mode %q: got %v, want %v", test.mode, got, test.want)
			}
		})
	}
}

func TestResolveTimezoneUsesFallbackForImportedLocalSchedules(t *testing.T) {
	fallback, err := time.LoadLocation("America/Mexico_City")
	if err != nil {
		t.Fatal(err)
	}
	got, err := resolveTimezone("local", fallback)
	if err != nil {
		t.Fatal(err)
	}
	if got != fallback {
		t.Fatalf("local timezone resolved to %v, want fallback %v", got, fallback)
	}
	if _, err := resolveTimezone("Not/A_Timezone", fallback); err == nil {
		t.Fatal("expected an invalid timezone to return an error")
	}
	if _, err := parseScheduleTime("2026-07-19T07:00:00-06:00", nil); err == nil {
		t.Fatal("expected a missing location to return an error instead of panicking")
	}
}
