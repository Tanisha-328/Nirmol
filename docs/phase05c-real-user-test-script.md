# Nirmol volunteer usability protocol

Prepared 18 October 2026 (Asia/Dhaka). **Planned research, not participant results.**
No volunteers were recruited and no feedback, task success rate or business
outcome was collected during Phase 05C. Browser simulations are separate evidence.

## Scope and permission

Run public-tool sessions first on the reviewed build with clearly labelled
synthetic inputs or permitted public modeled data. The report/account/moderator
tasks require a separately approved disposable integration and synthetic accounts.
Do not use the existing hosted project, apply migrations or enable AI as part of
this protocol without that separate authorization. A06 remains disabled.

For an initial formative round, invite 5–8 consenting adults with a mix of Bangla
and English preferences, phone sizes and familiarity with air-quality information.
These are proposed recruitment targets, not a representative sample or a power
calculation. Include people who can role-play parent/student/outdoor-work tasks;
do not recruit children or ask anyone to disclose diagnoses. Run 25–35 minute
individual sessions. Agree compensation beforehand if offered; do not invent
participant counts or testimonials for a pitch.

Read aloud, in the participant's preferred language:

> We are testing Nirmol, not you. Its air values are model estimates or explicitly
> labelled test inputs, and its comparisons are not medical advice. Participation
> is optional; you may skip any task or stop. We will record anonymous task notes,
> not your location, health information, password or diary. Account/report/AI
> tasks may use simulations. May we observe your interaction and retain anonymous
> notes for the agreed period?

Bangla consent prompt:

> আমরা নির্মল অ্যাপটি পরীক্ষা করছি, আপনাকে নয়। বাতাসের তথ্য মডেলের প্রাক্কলন
> বা স্পষ্টভাবে চিহ্নিত পরীক্ষার তথ্য; তুলনাগুলো চিকিৎসার পরামর্শ নয়। অংশ নেওয়া
> ঐচ্ছিক। যেকোনো কাজ বাদ দিতে বা পরীক্ষা বন্ধ করতে পারবেন। আপনার পরিচয়,
> অবস্থান, স্বাস্থ্যতথ্য, পাসওয়ার্ড বা ডায়েরি লিখে রাখব না। কিছু কাজ অনুকরণ হতে
> পারে। নামহীন পর্যবেক্ষণ রাখার অনুমতি দিচ্ছেন কি?

Record consent as yes/no and a random session code, not a signature/name in the
test spreadsheet. Separate permission is required for audio/video; default to no
recording. State the actual research owner, contact method, deletion date and
withdrawal procedure before collecting notes. Do not promise anonymous recordings
while retaining recognizable faces/voices.

## Prepare and record the environment

- Record commit/workspace patch identifier, build time, browser/OS/version,
  physical device model/viewport, language/theme, network conditions and evidence
  type: physical device, assistive technology, or browser emulation.
- Use a fresh browser profile. Demonstrate only public reference locations;
  decline GPS permission for the planned denial task. Never ask for home/work
  coordinates or a real symptom/incident entry.
- Use invented nonpersonal report text, a geometric test image without EXIF,
  synthetic local mailboxes and accounts A/B/M. Moderation is a role-play, not
  proof of a pollution source. Remove synthetic records using only approved
  disposable cleanup after the session.
- If offline fixtures are used, show an enduring observer label explaining that
  service responses are simulated. Do not inject demo records into production.
- Keep real Gemini off. A fixture answer tests interaction with reviewed text,
  not model understanding. A later live AI study requires its own approval/corpus.
- Disable screen recording and redact network captures by default. Never retain
  cookies, Auth links, private object paths, exact locations or unredacted prompts.

## Tasks and success criteria

Give the task first; do not point to the control. Use one neutral prompt after a
pause ("What would you try next?"). Record assistance rather than marking it an
unassisted success. Encourage thinking aloud. Stop if the person wants to stop,
starts sharing sensitive information or treats an estimate as urgent medical
assessment; explain the product limits without collecting their symptoms.

| # | Neutral task | Observable success / failure signal |
| --- | --- | --- |
| 1 Student | Before leaving, find the selected reference's current air information and when it applies. | Identifies PM2.5 unit, modeled source and valid time; does not call it their street measurement. |
| 2 Parent role | Compare 1.5 hours walking for a child and an adult using the provided input. | Finds unchanged numerical indicator, explains the stricter provisional category, does not infer a safe-play or medical-risk percentage. |
| 3 Outdoor-worker role | Compare permitted departure times for a fixed activity/duration. | Uses departure-time tool and Dhaka times; identifies relative ranking and that this does not route streets or guarantee conditions. |
| 4 Unsupported point | Try the supplied out-of-country point, then recover manually. | Recognizes unsupported coverage; no valid local result is invented. |
| 5 GPS denied | Deny device location and continue using a public city reference. | Understands permission is optional and a city centre is not their GPS position. |
| 6 Slow switch | Change from reference A to B while the synthetic response is delayed. | No obsolete A value is presented as B; understands the loading state. |
| 7 Missing forecast | Inspect a deliberately incomplete/stale fixture. | Notices unavailable hours/source age and avoids a fabricated recommendation. |
| 8 Bangla advisor | Ask a nonprivate environmental question using the simulated Bangla flow. | Understands provider consent/context, reviewed guidance and model limits; does not mistake fixture selection for measured semantic quality. |
| 9 Resident role | Submit a suspected waste-burning observation at the supplied incident point, without a photo first. | Independently confirms category, incident point and public-cell consent; finds pending receipt/history; keyboard user lands on receipt. |
| 10 Moderator role | With M, inspect and decide on a synthetic A report. | Distinguishes suspicion from proof, supplies a reason, understands conflict/error state. Real DB enforcement must be evaluated separately. |
| 11 Community visitor | Filter published summaries, select a coarse cell/list item and try background-map failure. | List/cell/filter agree; person understands approximate cells, private photos and empty versus unavailable states. |
| 12 Account switch | Sign out A, sign in B, inspect saved places/private reports and explain the browser diary. | No old private response under B; diary is understood as separate browser-scoped storage and is not mistakenly claimed erased by logout. |

Where service configuration is unavailable, record **not executable** rather than
asking a participant to imagine a successful backend. Use an approved fixture
session only with explicit simulation labelling. Do not count that as live Auth,
RLS, Storage, moderator concurrency or AI verification.

## Keyboard, screen reader and physical-device run

On at least one small physical Android phone and one other available real device,
record the actual browser/version. Try portrait/landscape, text enlargement and
real touch targets; browser viewport emulation is not a substitute. Use both
themes and languages. Choose explicit offline fault injection rather than
overloading providers or disconnecting a shared service.

For a real NVDA/Firefox or Edge session (and TalkBack/VoiceOver if available):

1. Start at the top; navigate headings/landmarks and controls using keyboard only.
2. Read the main concentration's source/time/unit; use the forecast-hour select as
   the chart alternative. Check announced gaps and SHAP scale/noncausal limits.
3. Enter invalid exposure duration, correct it and verify error/result announcements.
4. Reach every reporting control with Tab/Shift+Tab; use Space for consent and
   Enter to submit. Confirm the new receipt receives focus; restart and confirm
   the category receives focus. Test a private photo only with a synthetic file.
5. Use map zoom and the public report list without a pointer; change language and
   verify localized control names. Select a report cell and hear its details.
6. Check advisor consent, pending/cancel/error messages and account-change hiding.
   Do not send a real private question. Native file pickers and select popups
   require actual platform testing; DOM automation cannot certify them.
7. Try 200%/400% zoom, reduced motion, high text size and focus visibility. Record
   clipping, lost focus, trapping, missing names, unexpected jumps and repeated
   announcements. Do not call a single session WCAG certification.

## Observation and Bangla debrief

Record task start/end, first action, wrong turns, assistance, completion and what
the participant says the result means. Avoid judging literacy or health knowledge.
Mark critical misunderstandings even when the person reached the right button.

Ask, without suggesting the desired answer:

- “এই সংখ্যাটি কী বোঝাচ্ছে? এটি কোথা থেকে এসেছে?”
- “এটি কি আপনার রাস্তার সরাসরি মাপ? কেন এমন মনে হচ্ছে?”
- “শিশুর জন্য কম বা বেশি শ্রেণি দেখালে আপনি কী বুঝছেন?”
- “যাত্রার সময়ের তুলনা কি রাস্তা বেছে দিচ্ছে, নাকি অন্য কিছু?”
- “মানচিত্রের পিন কি ঘটনার সঠিক জায়গা? কারা আপনার ছবি বা লেখা দেখতে পাবে?”
- “তথ্য না পাওয়া আর রিপোর্ট না থাকা—দুটির পার্থক্য বুঝতে পারছেন?”
- “পরামর্শকের কাছে কোন তথ্য পাঠাতে সম্মতি দিয়েছেন?”
- “কোন শব্দ বা বাক্য বুঝতে অসুবিধা হয়েছে? নিজের ভাষায় কীভাবে বলতেন?”

Native Bangla review must assess meaning and naturalness, not only whether a
translation key exists. Use a second reviewer for disputed terminology.

## Reporting template and decision rule

```text
Session code / date / observer:
Consent / optional recording permission / deletion date:
Commit + patch/build / physical device or emulation / browser / language / theme:
Service evidence: public live / synthetic protocol / real disposable / unavailable:
Task number:
Expected behavior:
Observed actions and exact visible error (redacted):
Completion: unassisted / assisted / failed / not executable / skipped by participant:
Elapsed time (exclude unrelated interruption):
Interpretation in participant's own words (no identifying details):
Accessibility/focus/layout issue:
Severity / reproducible steps / artifact with consent:
Repair owner / retest with an unseen task / actual retest result:
```

Summarize actual denominators and assistance separately; never count skipped or
unavailable tasks as successes. A small formative sample cannot establish market
adoption, clinical value, population usability or production capacity. A release
decision needs no unresolved privacy/security failure in the promised scope,
retested critical misunderstandings, actual service gates and named operational
owners. Do not invent success thresholds after seeing results; agree them with
the product/research owner before starting.
