# Frameplan — visual shot planner

Plan shots before you're on set. For each scene you see what the lens will actually give you: depth of field, field of view, background blur and how your lights fall on the talent. You can keep several scenes side by side as a storyboard.

No build step or dependencies. Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000   # then visit http://localhost:8000
```

## What it does

**Camera view.** A simulated frame through the chosen sensor and lens. Everything in it (subjects, floor, backdrop) is blurred by its real circle of confusion for the current focal length, aperture and focus distance. Point lights on the backdrop render as bokeh discs that grow as you open up. You can switch on a DOF zone overlay on the floor, rule-of-thirds lines, and frame guides (16:9, 2.39:1, 1.85:1, 4:5…). Light stands that creep into frame are flagged.

**Floor plan.** A top-down view of the camera, field-of-view cone, the depth-of-field band, the focus plane, subjects, lights with their beams, and the backdrop. You can:
- Drag anything to move it.
- Drag the green handle to pull focus, the grey handle to move the backdrop, and the blue handles to rotate the camera or aim the selected light.
- Hold Shift to snap, scroll to zoom, and drag empty space to pan.
- Use the arrow keys to nudge the selection and Delete to remove it.

Subjects are outlined green when they're in focus and amber when they're soft.

**Readouts.** Near and far limits, total DOF (front and back), hyperfocal distance, horizontal and vertical FOV, frame size at the subject with a shot-size name, backdrop blur as % of frame width, full-frame equivalent focal length and f-number, and the lit-to-shadow contrast ratio on the primary subject.

**DOF chart.** Blur circle against distance, with the CoC threshold, the sharp band, the focus plane, the subjects and the backdrop marked.

**Lens sweep.** The same shot at 16–200 mm. Tick *Keep subject size* to see perspective compression: the camera dollies so the subject stays the same size. Click a frame to apply that lens.

**Lighting.** Key, fill, rim, hair, background and practical roles. Modifiers are softbox, umbrella, LED panel, fresnel, bounce, bare bulb and sun. Each light has power, colour temperature (1900–10000 K), gel, beam angle and height. Presets set up three-point, Rembrandt, butterfly, split and window light around the primary subject.

**Camera tools.** Sensor formats from 1" to medium format. You can focus on the selected subject, jump to hyperfocal, or use *Stop down to fit all*, which finds the widest aperture that holds every subject sharp.

**Scenes and storyboard.** Add, duplicate, reorder and delete scenes. Everything autosaves to `localStorage`. You can export and import scenes as JSON, and there's a printable storyboard with thumbnails, specs, lighting and notes. Distances can be shown in metres or feet.

## Model notes

- DOF uses the thin-lens formulas with a CoC of sensor diagonal / 1500 (0.029 mm on full frame).
- Distances run along the lens axis, measured from the camera.
- Lighting uses inverse-square falloff with a soft beam edge. Soft modifiers use wrap-around Lambert shading on a cylinder, which shows which side of the talent is lit and how hard the falloff is. It's a planning aid, not a renderer: there are no cast shadows, bounces or facial features.

## Development

```
index.html        layout
css/styles.css    styles (dark UI, responsive, print storyboard)
js/optics.js      sensors, FOV, DOF, blur disc, equivalents (pure)
js/lighting.js    colour temperature, light falloff, subject shading (pure)
js/store.js       scene model, sample scenes, persistence, units
js/preview.js     simulated camera view
js/plan.js        interactive floor plan
js/dofchart.js    blur vs. distance chart
js/app.js         UI controller
tests/            node:test unit tests for the math and store
```

Run the tests with `node --test tests/*.test.js`.
