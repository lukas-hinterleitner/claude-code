# Changelog

## 0.3.0

- Each part of the meter can be turned off: `showContext`, `showFiveHour`, `showSevenDay`, `showResetTimes`, `showCost`, `showTokens`, `showRequests`. All are on by default.

## 0.2.0

- First release: context fill, 5h/7d rate-limit windows with reset times, session cost, token totals and request count on the hint line under the prompt, updated after every API request.
- `placement` setting: `inline` (dim, after the hint) or `below` (own line, coloured bars).
- `/usage-meter` shows or hides the meter.
