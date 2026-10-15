# Mobile UI/UX audit and patch

Scope: Canada Map, Netgraph, four Labs scenes and the Canada Android shell;
paired shared changes for Worldwide Map and Netgraph. Target web versions are
Canada 0.16.3 and Worldwide 0.7.3. Android 1.1.1 remains the signed native wrapper.

## Findings and changes

| Surface | Finding | Patch |
| --- | --- | --- |
| Navigation | View tabs, secondary controls and unlabeled icons compete for two or three phone rows. | One view picker and a single labelled primary row. Keep direct 3D and Sound access; restore the original control placement on desktop. |
| Map layers | Secondary map details and resets interrupt the route controls. | Keep Traffic first, collapse Map details and Terrain, and put reset after Appearance. Existing On/Off states and saved preferences remain. |
| Map credits | MapLibre 6 starts compact credits expanded, covering the stationary first phone view. | Collapse through the existing disclosure on phones; preserve the complete attribution and its touch/keyboard control. |
| Netgraph | The focus/region bar, route window, zoom controls and legend compete with the graph. | Group traffic controls in the mobile settings sheet and the legend in View. Preserve filtering, layout, route meaning and live activity. |
| Find and Sound | Outside-tap/Escape dismissal is less discoverable on phones. Small search fields can trigger browser zoom. | Add explicit close buttons and focus restoration; use 16px form fields and 44px controls. |
| Keyboard and orientation | Fixed panel budgets assume the keyboard and browser bars leave the full viewport. | Measure the visual viewport and dock. Keep sheets above the keyboard and preserve their scrolling. |
| Inspection | Fixed-width, single-line coordinates truncate useful details. | Wrap mobile facts and names, increase fact text, and keep the close control reachable. |
| Labs | The controls wrap heavily. Conflicting top/bottom rules stretch the Loom legend across the scene. | Keep scene selection, Pause and Sound on the dock; put secondary controls in View. Restore the legend's natural height and keep it separate from the caption. |
| Android | The 1.1.1 shell already has one 48dp native menu and no duplicate view navigation. | Keep the native shell and original signing identity. The web changes apply to existing installations; the native menu's corner remains clear. |

Choosing the current view closes the picker without restarting the feed or
scene. Back dismisses a sheet; nested region selection keeps its parent sheet.
Labs Back handling retains the selected experiment URL. Shared sound controls
and wake-lock ownership reuse the existing roadmap cleanup; independent MQTT,
clock and recovery work remains outside this UI patch.

## Validation

The before-scenes come from the exact successful Canada main CI run
[38582373502](https://github.com/n30nex/CartoLite/actions/runs/38582373502).
Use synthetic fixtures for comparable after-scenes at 320px and 390px portrait,
short landscape and tablet sizes. Cover themes, large text, keyboard viewport
changes, view switching, focus restoration, Back, region filtering, all four
Labs scenes, and the Android user-agent path. Retain the existing privacy,
packet/audio, frontend-size and 4,000-node/7,000-route performance gates.

No physical-device acceptance is claimed. The previous phone session ended
before an update; this patch does not access or alter that device. Physical
testing remains optional under the owner's release instruction.

## Platform reference

MapLibre's current [AttributionControl implementation](https://github.com/maplibre/maplibre-gl-js/blob/main/src/ui/control/attribution_control.ts)
documents the initially expanded compact disclosure and collapse-on-map-movement
behavior. CartoLite keeps the initial camera still, so the phone default needs
an explicit initial collapse while keeping attribution available.
