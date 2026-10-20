# Real Hold / Resume (browser softphone)

Hold is **not** a microphone mute. A held prospect stops hearing and being heard and hears a waiting message until Resume.

## Topology
* **DIRECT (default, unchanged):** the browser leg runs `<Dial answerOnBridge><Number>` — no hold possible.
* **CONFERENCE (only when a Super Admin turns on *Hold* in Voice settings; off by default):** at connect time the browser leg joins a private conference named `garageos-call-<sessionId>` (`endConferenceOnExit`, never recorded, no wait music) and the server places the prospect's call through the REST API with the **server-resolved destination and the corporate caller ID**; when the prospect answers, Twilio fetches the signed `/api/voice/conference/<sessionId>/join` and the prospect joins the same conference. Two participants only. If either side leaves, the conference — and so the other leg — ends. Conference is an internal mechanism; there is no conference, transfer or recording feature.
* Status callbacks of the prospect call arrive at the signed `/api/voice/conference/<sessionId>/status` and drive the same forward-only state machine. The browser leg joins before the prospect answers, so the softphone follows the **server** state (`getCallLiveState`) to show Ringing → Connected.

## Hold / Resume
`holdCall(sessionId)` / `resumeCall(sessionId)`: owner-only, require the CONFERENCE topology and an answered (IN_PROGRESS) call. State on the session row: `NONE → HOLDING → HELD → RESUMING → NONE`, each step a compare-and-set, so concurrent clicks yield one provider request; a repeat returns `alreadyApplied`; an opposite/in-flight request returns `HOLD_BUSY`. Only the **prospect participant** is updated (`hold` + `holdUrl=/api/voice/hold-music`, a spoken notice + pause loop that needs no stored audio). A provider error releases the claim (`HOLD_FAILED`, audited). A request that died halfway (stuck HOLDING/RESUMING > 15 s) is healed from the provider's own participant state on the next read. A terminal call state always clears the hold; a hold racing a hang-up cannot resurrect it.

## Rollout (needs a human)
Automated tests use a scripted provider. Before enabling for sellers: Super Admin adds their own phone to the test list, turns **Hold** on, places a **test call**, answers it, presses Hold (the phone must hear the waiting message and not the browser), Resume, and hangs up from each side. Turn the switch off to return to direct dialing at any time (calls already in progress keep their topology).
