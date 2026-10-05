# Scope and preservation

An existing interactive defaults to Integrate only. A request to “make this SLS-ready” authorises the narrow changes needed for transport, payloads and packaging, not a visual or learning-sequence redesign. Offer mode choice without blocking the default. Explicit user instructions always override defaults.

## Integrate only

Take baseline screenshots and exercise the learning mechanism before modification. Preserve content, CSS, questions, randomisation, answer order, scoring policy, model equations, simulation response, reset behaviour and navigation. Keep original assets byte-identical unless a required dependency packaging change is documented. Retain existing valid controls and feedback.

Add vendor references in the verified order, an authored payload adapter and the smallest reliable semantic hooks. Append an optional native closed `details` report after existing content, with readable labels and keyboard focus; do not insert a tall analytics dashboard, modal, floating overlay or fixed toolbar. Avoid global CSS that changes the existing page. With “no visible change”, send reports in SLS feedback only and add no report UI.

Compare original and integrated behaviour and screenshots in the same browser/viewports. Test desktop, narrow mobile and a real 450px iframe, but assess preservation rather than requiring the legacy design to meet a fresh-build first-viewport composition. Report existing clipping/scrolling or inaccessible controls as findings with an optional improvement, not as a reason to rewrite the layout automatically. Newly introduced UI must not worsen those limitations.

If the source's visible score and model disagree, distinguish a pre-existing scoring defect from an integration regression. Explain the evidence and the smallest correction; do not silently change a deliberate score policy. Work that changes learning content or completion requirements belongs in improvement/redesign scope.

## Integrate and improve

Implement only the requested improvements. Name them in the delivery summary and compare results to the original. Preserve unrelated structure and assets. Improvements can include wrong-answer feedback, targeted misconception teaching moves, input labels, touch targets or mobile reflow. Avoid treating this mode as blanket permission for a redesign.

## Build or redesign

Consult the current Full details prompt from the Prompt Library, preserving any user-provided master prompt. Apply a compact 100%-wide × 450px iframe composition with a concise goal, core representation, usable primary control and immediate result. Keep 44px or larger touch targets, keyboard access, readable labels, zoom/reflow, non-colour cues and reduced-motion access. Use shared workspaces for related outcomes and closed optional help/reports. Bundle runtime dependencies locally, preferably self-contained HTML for a fresh client-side activity, while preserving required xAPI transport. Adapt to the 90vh new-tab context without clipping content.

Use this design contract only for fresh builds or explicitly authorised redesigns. Model-aware evidence and unchanged xAPI transport remain required in all three modes.
