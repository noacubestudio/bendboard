// PROPERTIES, STATE

// mouse hover/ opened
let settingsFocused = false;
let menuButtonFocused = false;

// audio
let webMidiLibraryEnabled = false;

// sound settings
const soundconfig = {
  filter: undefined,
  delay: undefined,
  delayWet: 0.2,
  waveform: "sawtooth",
  maxAmp: 0.5,
  attackDur: 0.05, // in seconds
  releaseDur: 0.3 // in seconds
}


const soundsArray = [];
// initialized with 16 voices, 
// each contains:
// - synth object
// - source type: 
//   off (unused), kbd, touch, mouse, release (only sound still fading out)
// - properties: cents (from basenote), step, etc...

const layout = {
  // start point
  baseX: 0, // set based on screen dimensions
  baseY: 0, // set based on screen dimensions
  // per column
  nextColumnOffsetCents: 200,
  // width and height
  columnWidth: 54,
  centsToPixels: 0.5, //0.75
  // special view mode(s)
  spiralMode: false,
  stepsVisibility: 1.0
}
const scale = {
  baseFrequency: 110.0,
  maxSnapToCents: 40,
  alwaysForceSnap: false,
  equalDivisions: 12,
  periodRatio: [2, 1], // range used for scales and EDO
  scaleRatios: [24, 27, 30, 32, 36, 40, 45, 48],
  mode: 0,
  // set on scale updates
  sortedFractions: [], 
  cents: []
}
const midiSettings = {
  deviceName: "",
  baseOctave: 3
}


// LOAD

let boldMonoFont;
let keyboardShader;

window.preload = () => {
  boldMonoFont = loadFont('iAWriterQuattroS-Bold.ttf');
  keyboardShader = loadShader('shader.vert', 'shader.frag');
}


// CANVAS AND INTERFACE

const initialSettings = [
  { name: 'edo', label: 'Equal divisions of octave', initialValue: scale.equalDivisions, type: 'number', placeholder: '12, 14, 19, 31' },
  { name: 'scale', label: 'Just Intonation Scale', initialValue: scale.scaleRatios.join(":"), type: 'text', placeholder: '12:17:24, 4:5:6:7, all' },
  { name: 'mode', label: 'Mode (starting step)', initialValue: scale.mode, type: 'number', placeholder: '0, 1 ... last step of scale' },
  { name: 'basefreq', label: 'Base frequency (Hz)', initialValue: scale.baseFrequency, type: 'number', placeholder: '25.50 (low A)' },
  { name: 'period', label: 'Repetition Interval (ratio)', initialValue: scale.periodRatio.join("/"), type: 'text', placeholder: '2/1' },
  { name: 'snaprange', label: 'Snapping height (cents)', initialValue: scale.maxSnapToCents, type: 'number', placeholder: '0, 30, 50', step: '5' },
  { name: 'xoffset', label: 'Column offset (cents)', initialValue: layout.nextColumnOffsetCents, type: 'number', placeholder: '200 (a tone)' },
  { name: 'height', label: 'Column height (px per cent)', initialValue: layout.centsToPixels, type: 'number', placeholder: '0.5, 0.75, 0 (circular)', step: '0.05' },
  { name: 'columnpx', label: 'Column width (px)', initialValue: layout.columnWidth, type: 'number', placeholder: '50' },
  { name: 'stepsvisibility', label: 'Visibility of scale/EDO frets', initialValue: layout.stepsVisibility, type: 'number', placeholder: '0.1, 0.7, 1.0', step: '0.1' },
  { name: 'waveform', label: 'Waveform', initialValue: soundconfig.waveform, type: 'text', placeholder: 'sine, square, triangle, sawtooth' },
  { name: 'delay', label: 'Delay dry/wet', initialValue: soundconfig.delayWet, type: 'number', placeholder: '0, 0.7, 1.0', step: '0.1' },
  { name: 'midiname', label: 'MIDI IN • Search device name', initialValue: midiSettings.deviceName, type: 'text', placeholder: 'Check console (F12) for options' },
  { name: 'midioctave', label: 'MIDI IN • Starting octave', initialValue: midiSettings.baseOctave, type: 'number', placeholder: '2, 3, 4' },
  // Add more objects as needed
];

let density = 1;
const container = document.getElementById("canvas-container");
const parsedUrl = new URL(window.location.href);

window.setup = () => {
  // p5 setup
  const cnv = createCanvas(windowWidth, windowHeight, WEBGL).parent(container);
  cnv.id("mainCanvas");
  
  noLoop();
  textFont(boldMonoFont);
  rectMode(CORNERS);

  // set density
  density = displayDensity(); // 1
  if (density > 2) density = 1;
  pixelDensity(density);
  print("Display density:", density);

  // match initial window size
  resizeCanvasAndLayout();

  // GUI and settings
  const mainCanvas = document.getElementById("mainCanvas");
  const menuButton = document.getElementById("menuButton");
  const settingsDiv = document.getElementById("settingsDiv");

  // initial write to the settings input
  writeSettingsFromArray(settingsDiv, initialSettings);
  // initial settings from the default inputs
  updateScaleProperties();

  // update actual values from URL params
  // check all the settings that are in the menu

  //console.log(parsedUrl.searchParams);
  for (const {name, type} of initialSettings) {
    if (parsedUrl.searchParams.has(name)) {
      const value = parsedUrl.searchParams.get(name);
      if (value === "" || isNaN(value) && type === "number") { 
        parsedUrl.searchParams.delete(name); 
        const describeValue = (value === "") ? "empty" : "\"" + value + "\"";
        print("\"" + name + "\" parameter in the URL can not be " + describeValue + "!");
      } else { 
        updateSetting({name, value, type})
        const inputElement = document.querySelector('input[name='+name+']');
        inputElement.value = value;
      } 
    }
  }

  // clean up URL immediately if there is a difference
  const maybeChangedURL = parsedUrl.toString();
  if (maybeChangedURL !== window.location.href) {
    print("Removed some query parameters")
    // Replace the current URL with the updated one without adding to history
    window.history.replaceState({}, '', parsedUrl.toString());
  }


  // show/hide the settings input
  menuButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (settingsDiv.style.display !== 'block') {
      settingsDiv.style.display = 'block';
    } else {
      settingsDiv.style.display = 'none';
    }
  });

  // escape key also works
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      if (settingsDiv.style.display !== 'block') {
        settingsDiv.style.display = 'block';
      } else {
        settingsDiv.style.display = 'none';
        settingsFocused = false;
      }
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === 'visible') {
      // console.log('browser document focused (again)');
    } else {
      // console.log('lost focus');
      fill("#00000090");
      rect(-width/2, -height/2, width, height);
      loop();
    }
  });

  // read the settings input if it changed and make changes
  settingsDiv.addEventListener("input", (event) => {
    const target = event.target;
    releaseAllChannels("midi");
    releaseAllChannels("kbd");
    updateSetting(target);
    updateURLfromSetting(target);
    window.draw();
  });
  
  // pointer events
  mainCanvas.addEventListener('pointerdown',   handlePointerEvent);
  mainCanvas.addEventListener('pointermove',   handlePointerEvent);
  mainCanvas.addEventListener('pointerup',     handlePointerEvent);
  mainCanvas.addEventListener('pointercancel', handlePointerEvent);

  // change focused state
  menuButton.addEventListener('mouseenter', () => {menuButtonFocused = true; window.draw();});
  menuButton.addEventListener('mouseleave', () => {menuButtonFocused = false; window.draw();});
  settingsDiv.addEventListener('mouseenter', () => {settingsFocused = true;});
  settingsDiv.addEventListener('mouseleave', () => {settingsFocused = false;});


  // CONNECT AUDIO NODES

  soundconfig.filter = new p5.BandPass();
  soundconfig.filter.res(1);
  soundconfig.filter.freq(220);

  // reverb = new p5.Reverb();
  // reverb.disconnect();
  // reverb.process(lpFilter, 1.5, 2);
  // reverb.connect(lpFilter);

  soundconfig.delay = new p5.Delay();
  soundconfig.delay.process(soundconfig.filter, 0.18, .6, 2300);
  soundconfig.delay.setType(1);
  soundconfig.delay.drywet(soundconfig.delayWet);

  // initialize all channels
  for (let i = 0; i < 16; i++) {
    let synth = new p5.Oscillator();

    synth.disconnect();
    synth.connect(soundconfig.filter);
    synth.setType(soundconfig.waveform);
    synth.freq(scale.baseFrequency)
    synth.amp(0);

    soundsArray.push({synth, source: "off", properties: {}});
  }
}

window.windowResized = () => {
  resizeCanvasAndLayout();
  window.draw();
}

function resizeCanvasAndLayout() {
  // leaving some room to prevent scrollbars
  let newHeight = windowHeight - 2;
  let newWidth = windowWidth - 2;
  resizeCanvas(newWidth, newHeight, false); // no redraw

  // set the starting point (initial frequency) somewhere in this area
  if (layout.spiralMode) {
    layout.baseX = Math.floor(newWidth / 2);
    layout.baseY = Math.floor(newHeight / 2);
  } else { 
    layout.baseX = Math.floor(constrain(newWidth / 2 - 200, 0, newWidth * 0.25));
    layout.baseY = Math.floor(constrain(newHeight / 2, 0, newHeight)); // vertical center  
  }
}

function writeSettingsFromArray(settingsDiv, settingsArray) {

  // Generate labels and inputs
  settingsArray.forEach((inputObj) => {
    const { name, label, initialValue, type, placeholder, step } = inputObj;

    const groupElement = document.createElement('div');
    groupElement.classList.add('input-group');

    const labelElement = document.createElement('label');
    labelElement.textContent = label;
    labelElement.classList.add('input-label');

    const inputElement = document.createElement('input');
    inputElement.type = type;
    inputElement.name = name;
    inputElement.value = initialValue;
    inputElement.initialValue = initialValue;
    if (placeholder !== undefined) inputElement.placeholder = placeholder;
    if (step !== undefined) inputElement.step = step;
    inputElement.classList.add('input-field');

    groupElement.appendChild(labelElement);
    groupElement.appendChild(inputElement);
    settingsDiv.appendChild(groupElement);
  });
}

function updateSetting(target) {
  let {name, value, type} = target;
  if (value === undefined || value.length === 0) return;
  if (type === "number") value = Number(value);

  switch (name) {
    case "edo":
      if (value > 0) scale.equalDivisions = value;
      // regenerate all cents if no specific scale used
      if (scale.scaleRatios.length === 0) updateScaleProperties();
      break;
    case "scale":
      if (["all"].includes(value)) {
        scale.scaleRatios = [];
        updateScaleProperties();
      } else {
        // target.value = value.replace(/[, ]/g, ":");
        // value = target.value;
        const newScaleRatios = value.split(/[,.: ]+/);
        if (newScaleRatios.length >= 1 && newScaleRatios.every((element) => (Number(element) > 0))) {
          scale.scaleRatios = newScaleRatios.map(Number);
          updateScaleProperties();
        }
      }
      break;
    case "mode":
      scale.mode = value;
      updateScaleProperties();
      break;
    case "basefreq":
      scale.baseFrequency = value;
      break;
    case "period":
      // is fraction
      const foundFractionArr = value.match(/(\d+)\s*\/\s*(\d+)/);
      if (foundFractionArr) {
        if (foundFractionArr[1] / foundFractionArr[2] > 1) {
          scale.periodRatio = [Number(foundFractionArr[1]), Number(foundFractionArr[2])];
          updateScaleProperties();
        }
      } else if (!isNaN(value)) {
        if (Number(value) > 1) {
          scale.periodRatio = [Number(value), 1];
          updateScaleProperties();
        }
      }
      break;
    case "xoffset":
      layout.nextColumnOffsetCents = value;
      break;
    case "height":
      if (value == 0) {
        layout.centsToPixels = 1;
        layout.spiralMode = true;
        resizeCanvasAndLayout();
      } else if (value > 0) {
        layout.centsToPixels = value;
        layout.spiralMode = false;
        resizeCanvasAndLayout();
      }
      break;
    case "columnpx":
      if (value > 10 && value < width) layout.columnWidth = value;
      break;
    case "snaprange":
      if (value >= 0) scale.maxSnapToCents = value;
      break;
    case "waveform":
      if (["sine", "square", "triangle","sawtooth"].includes(value)) {
        soundconfig.waveform = value;
        for (let i = 0; i < soundsArray.length; i++) {
          soundsArray[i].synth.setType(soundconfig.waveform);
        }
      }
      break;
    case "delay":
      if (value > 0) {
        soundconfig.delayWet = value;
        soundconfig.delay.drywet(soundconfig.delayWet);
      }
      break;
    case "midiname":
      midiSettings.deviceName = value;
      initNewMidiInput(midiSettings.deviceName);
      break;
    case "midioctave":
      midiSettings.baseOctave = value;
      break;
    case "stepsvisibility":
      if (value >= 0 && value <= 1.0) layout.stepsVisibility = value;
      break;
    default:
      console.log("Property " + name + " was not found!")
      break;
  }
}

function updateURLfromSetting(target) {

  let {name, value, initialValue} = target;

  if (value == initialValue || value == null || value == "") {
    parsedUrl.searchParams.delete(name);
  } else {
    parsedUrl.searchParams.set(name, value);
  }

  // Replace the current URL with the updated one without adding to history
  window.history.replaceState({}, '', parsedUrl.toString());
}

function updateScaleProperties() {
  // first set the array of sorted fractions
  scale.sortedFractions = sortedFractionArrsFromRatioChord(scale.scaleRatios, scale.mode);

  // then set the array of cents
  if (scale.sortedFractions.length > 0) {
    scale.cents = getCentsArrFromSortedFractions(scale.sortedFractions);
  } else {
    scale.cents = getCentsArrFromEDO(scale.equalDivisions, scale.periodRatio);
  }
}

function sortedFractionArrsFromRatioChord(ratioChordArr, modeNum) {
  // nothing to do with empty array
  if (ratioChordArr.length === 0) return [];

  // get ratio chord like 4:5:6 and return fractions like 4/4 5/4 6/4
  const denominator = ratioChordArr[0];
  const fractionsArr = ratioChordArr.map((numerator) => [numerator, denominator])
  
  // use the mode number to essentially change which pitch is 1/1
  modeNum = wrapNumber(modeNum, 0, fractionsArr.length);
  const transposedArr = transposeScale(fractionsArr, fractionsArr[modeNum]);
  const modeMovedArr = moveUnderNextPeriod(transposedArr, modeNum, scale.periodRatio);

  // reduce to period (e.g. all fractions under 2/1) and simplify the fractions
  const reducedArr = modeMovedArr.map((fraction) => getPeriodReducedFractionArray(fraction[0], fraction[1]));
  const simplifiedArr = reducedArr.map((fraction) => getSimplifiedFractionArray(fraction[0], fraction[1]));

  // sort fractions and remove duplicates
  simplifiedArr.sort((a, b) => a[0] * b[1] - b[0] * a[1]);
  const uniqueArr = simplifiedArr.filter((fraction, index) =>
    index === simplifiedArr.findIndex((f) => f[0] === fraction[0] && f[1] === fraction[1])
  );

  return uniqueArr;
}

function transposeScale(scale, newRoot) {
  const currentRoot = scale[0];
  const interval = [newRoot[0] * currentRoot[1], newRoot[1] * currentRoot[0]];

  return scale.map((fraction) => [
    fraction[0] * interval[1],
    fraction[1] * interval[0]
  ]);
}

function moveUnderNextPeriod(scaleArr, modeNum, periodFraction) {
  // take as many elements as "mode" from the start of the scale array and add them to the end in that order
  // while also making the fractions relative to the end, not start of the array.
  // to do this just multiply by the period
  const movedElements = scaleArr.slice(0, modeNum).map((fraction) => [
    fraction[0] * periodFraction[0],
    fraction[1] * periodFraction[1]
  ]);
  return scaleArr.concat(movedElements);
}

function getCentsArrFromSortedFractions(sortedFractionsArr) {
  let scaleCents = [];
  for (let i = 0; i < sortedFractionsArr.length; i++) {
    const fraction = sortedFractionsArr[i]
    const newCents = ratioToCents(fraction[1], fraction[0]);
    scaleCents.push(newCents);
  }
  return scaleCents;
}

function getCentsArrFromEDO(edo, periodRatio) {
  const scaleCents = [];
  const stepSize = 1200 / edo;
  const periodCents = ratioToCents(periodRatio[1], periodRatio[0]);
  const stepCount = Math.floor(periodCents / stepSize);
  for (let i = 0; i < stepCount; i++) {
    scaleCents.push(stepSize * i);
  }
  return scaleCents;
}




window.draw = () => {

  if (window._renderer == undefined) return;

  background("#000");
  noStroke();

  // draws the keyboard and octave circle
  drawShader();
  resetShader();

  // go to top left
  push();
  translate(-width/2, -height/2);

  // text at base position showing base freq
  fill("white");
  textAlign(CENTER, CENTER);
  textSize(12);
  const baseNoteOffset = {
    x: layout.spiralMode ? 0 : layout.columnWidth*0.5,
    y: layout.spiralMode ? - layout.columnWidth*2.5 - 2 : - 2,
  }
  text(scale.baseFrequency, layout.baseX + baseNoteOffset.x, layout.baseY + baseNoteOffset.y);

  const playingSteps = getStepsFromSoundsArray(soundsArray.filter(ch => ch.source !== "off" && ch.source !== "release"));
  // text(`${JSON.stringify(playingSteps)}`, width/2, 20);

  // return displayStrings, color and opacity as well as the step per item
  const playingStepsLabels = (scale.sortedFractions.length > 0) 
    ? getFractionsDisplayFromPlayingSteps(scale.sortedFractions, playingSteps) 
    : getCentsDisplayFromPlayingSteps(scale.cents, playingSteps);

  // display under the octave circle
  playingStepsLabels.forEach((item, index) => {
    const displayText = item.displayString ?? wrapNumber(item.step, 0, scale.cents.length).toString() ?? "?";
    fill(chroma("black").alpha(item.opacity * 0.6).hex());
    ellipse(46, 102 + index * 20, Math.max(displayText.length*10, 18), 18);
    const fillHex = chroma.oklch(0.8, 0.2, item.hue).alpha(item.opacity).hex();
    fill(fillHex);
    text(displayText, 46,  100 + index * 20);
  });

  if (getAudioContext().state !== "running") {
    fill("#00000090");
    rect(0, 0, width, height);
    fill("white");
    textAlign(CENTER, CENTER);
    textSize(18);
    text("Bendboard", width/2, height/2 - 140);
    textSize(13);
    text("Audio is " + getAudioContext().state + ".", width/2, height/2 - 20);
    text("Click or tap to resume.", width/2, height/2);
    //text(INFO, width/2, height/2 + 20);
    killAllChannels();
  } else {
    noLoop();
  }

  pop();
}


function drawShader() {

  drawingContext.depthMask(true);
  drawingContext.enable(drawingContext.DEPTH_TEST);

  shader(keyboardShader);

  //position
  const xTo01 = (x) => x / width;
  const yTo01 = (y) => y / height;

  const vecTo01 = ([x, y]) => [xTo01(x), 1 - yTo01(y)];

  // base, permanent
  keyboardShader.setUniform("u_resolution", [width * density, height * density]);
  keyboardShader.setUniform("u_pixelHeight", yTo01(1));

  // layout
  keyboardShader.setUniform("u_basePosition", vecTo01([layout.baseX, layout.baseY]));
  keyboardShader.setUniform("u_columnWidth", xTo01(layout.columnWidth));
  keyboardShader.setUniform("u_columnOffsetY", yTo01(layout.nextColumnOffsetCents*layout.centsToPixels));
  
  // scale
  const periodCents = ratioToCents(scale.periodRatio[1], scale.periodRatio[0]);
  keyboardShader.setUniform("u_octaveHeight", yTo01(layout.centsToPixels * periodCents))
  keyboardShader.setUniform("u_edo", scale.equalDivisions);

  // spiral mode
  keyboardShader.setUniform("u_spiralMode", layout.spiralMode);

  // steps in the scale / playing steps Y
  const playedCents = soundsArray.filter(
    ch => ch.source !== "off" && ch.source !== "release" && ch.properties.cents !== undefined
  ).map(ch => ch.properties.cents);

  // RGB display for scale cents
  const stepsYArray = [];
  const stepsRedArray = [];
  const stepsGreenArray = [];
  const stepsBlueArray = [];
  scale.cents.forEach((cent) => {
    const percentOfOctave = cent / ratioToCents(scale.periodRatio[1], scale.periodRatio[0]);
    const hue = percentOfOctave * 360;
    const color = chroma.oklch(0.6, 0.25, hue).rgb(false);
    const [r, g, b] = color.map(value => value/255);

    stepsYArray.push(yTo01(cent * layout.centsToPixels));
    stepsRedArray.push(r);
    stepsGreenArray.push(g);
    stepsBlueArray.push(b);
  });
  keyboardShader.setUniform("u_stepsYarray", stepsYArray);
  keyboardShader.setUniform("u_stepsRedArray", stepsRedArray);
  keyboardShader.setUniform("u_stepsGreenArray", stepsGreenArray);
  keyboardShader.setUniform("u_stepsBlueArray", stepsBlueArray);
  keyboardShader.setUniform("u_stepsYarrayLength", stepsYArray.length);

  keyboardShader.setUniform("u_stepsVisibility", layout.stepsVisibility);

  // RGB display for played cents
  const playYArray = [];
  const playRedArray = [];
  const playGreenArray = [];
  const playBlueArray = [];
  playedCents.forEach((cent) => {
    const periodCents = ratioToCents(scale.periodRatio[1], scale.periodRatio[0]);
    const inOctaveCents = wrapNumber(cent, 0, periodCents);
    const percentOfOctave = inOctaveCents / periodCents;
    const hue = percentOfOctave * 360;
    const color = chroma.oklch(0.6 + layout.stepsVisibility*0.4, 0.25 - 0.15 * layout.stepsVisibility, hue).rgb(false);
    const [r, g, b] = color.map(value => value/255);

    playYArray.push(yTo01(cent * layout.centsToPixels));
    playRedArray.push(r);
    playGreenArray.push(g);
    playBlueArray.push(b);
  });
  keyboardShader.setUniform("u_playYarray", playYArray);
  keyboardShader.setUniform("u_playRedArray", playRedArray);
  keyboardShader.setUniform("u_playGreenArray", playGreenArray);
  keyboardShader.setUniform("u_playBlueArray", playBlueArray);
  keyboardShader.setUniform("u_playYarrayLength", playYArray.length);

  //circle
  const radius = menuButtonFocused ? 40 : 44;
  keyboardShader.setUniform("u_circlePos", vecTo01([46, 46]));
  keyboardShader.setUniform("u_circleRadius", yTo01(radius));

  rect(0,0,width,height);

  drawingContext.depthMask(false);
  drawingContext.disable(drawingContext.DEPTH_TEST);
}


function getStepsFromSoundsArray(playingChannels) {
  // get the exact step that is playing with kbd/midi, or that is closest in cents
  // dist parameter describes how close a played pitch is to the nearest step
  const periodCents = ratioToCents(scale.periodRatio[1], scale.periodRatio[0]);
  
  function findClosestIndex(sortedArray, target) {
    return sortedArray.reduce(
      (acc, curr, index) =>
        Math.abs(curr - target) < Math.abs(sortedArray[acc] - target) ? index : acc,
      0
    );
  }
  
  return playingChannels.map(ch => {
    if (!isNaN(ch.properties.midiOffset)) return {offset: ch.properties.midiOffset, dist: 0};
    if (!isNaN(ch.properties.kbdstep)) return {offset: ch.properties.kbdstep, dist: 0};

    const playedCents = ch.properties.cents;
    let octave = Math.floor(playedCents / periodCents);
    const inOctaveCents = wrapNumber(playedCents, 0, periodCents);
    const closestStepInOctave = findClosestIndex([...scale.cents, periodCents], inOctaveCents);
    const closestStep = closestStepInOctave + octave * scale.cents.length;
    const distanceToStep = Math.abs(playedCents - stepOffsetToCents(closestStep));
    return {offset: closestStep, dist: distanceToStep};
  });
}

// get fractions for all the played steps
function getFractionsDisplayFromPlayingSteps(scaleFractions, playingSteps) {
  let fractionItems = [];

  // only if nothing is playing, show the full scale instead
  if (playingSteps.length === 0) {
    scaleFractions.forEach((ratioArr, index) => {
      const displayString = ratioArr[0] + "/" + ratioArr[1];
      const cent = scale.cents[index % scale.cents.length];
      const percentOfOctave = cent / ratioToCents(scale.periodRatio[1], scale.periodRatio[0]);
      const hue = percentOfOctave * 360;
      fractionItems.push({step: index, displayString, hue, opacity: 1});
    });
  } else if (playingSteps.length === 1) {
    const ratioArr = scaleFractions[wrapNumber(playingSteps[0].offset, 0, scale.cents.length)];
    const displayString = ratioArr[0] + "/" + ratioArr[1];
    const cent = scale.cents[wrapNumber(playingSteps[0].offset, 0, scale.cents.length)]; 
    const percentOfOctave = cent / ratioToCents(scale.periodRatio[1], scale.periodRatio[0]);
    const hue = percentOfOctave * 360;
    const opacity = map(playingSteps[0].dist, 0, scale.maxSnapToCents, 1, 0.3, true);
    fractionItems.push({step: playingSteps[0].offset, displayString, hue, opacity});
  } else {
    // from lowest to highest, relative to lowest step
    playingSteps.sort((a, b) => a.offset - b.offset);

    // ratio of lowest step to start of that octave
    const baseStepOctave = Math.floor(playingSteps[0].offset / scale.cents.length);
    const baseStep = playingSteps[0].offset - baseStepOctave * scale.cents.length;
    const baseStepRatio = scaleFractions[baseStep];

    // get ratios of steps relative to that lowest step
    playingSteps.forEach((stepObj) => {

      const step = stepObj.offset;

      // ratio of the selected step to start of the octave it is in
      const stepOctave = Math.floor(step / scale.cents.length);
      const stepInOctave = step - stepOctave * scale.cents.length;
      const stepRatio = scaleFractions[stepInOctave];

      // ratio to multiply by to account for octave delta from base
      const deltaOctaves = stepOctave - baseStepOctave;
      let octavesRatio = [
        scale.periodRatio[0] ** Math.abs(deltaOctaves), 
        scale.periodRatio[1] ** Math.abs(deltaOctaves)
      ];
      // divide if below 0
      if (deltaOctaves < 0) [octavesRatio[0], octavesRatio[1]] = [octavesRatio[1], octavesRatio[0]];

      // finally, get the ratio between this step and the base like this:
      // divide by the base step ratio, multiply by the step ratio, multiply by octaves ratio
      const finalRatio = getSimplifiedFractionArray(
        baseStepRatio[1] * stepRatio[0] * octavesRatio[0],
        baseStepRatio[0] * stepRatio[1] * octavesRatio[1]
      );

      const displayString = finalRatio[0] + "/" + finalRatio[1];
      // cents array is sorted just like the steps, so can be used here
      // color based on cents relative to total cents in the period
      const cent = scale.cents[stepInOctave];
      const percentOfOctave = cent / ratioToCents(scale.periodRatio[1], scale.periodRatio[0]);
      const hue = percentOfOctave * 360;
      const opacity = map(stepObj.dist, 0, scale.maxSnapToCents, 1, 0.3, true);
      fractionItems.push({step, displayString, hue, opacity});
    });
  }
  return fractionItems;
}

function getCentsDisplayFromPlayingSteps(scaleCents, playingSteps) {
  let centItems = [];

  // only if nothing is playing, show the full scale instead
  if (playingSteps.length === 0) {
    scaleCents.forEach((cent, index) => {
      const percentOfOctave = cent / ratioToCents(scale.periodRatio[1], scale.periodRatio[0]);
      const hue = percentOfOctave * 360;
      centItems.push({step: index, displayString: cleanRound(cent).toString(), hue, opacity: 1});
    });
  } else if (playingSteps.length === 1) {
    const cent = scaleCents[wrapNumber(playingSteps[0].offset, 0, scale.cents.length)];
    const percentOfOctave = cent / ratioToCents(scale.periodRatio[1], scale.periodRatio[0]);
    const hue = percentOfOctave * 360;
    const opacity = map(playingSteps[0].dist, 0, scale.maxSnapToCents, 1, 0.3, true);
    centItems.push({step: playingSteps[0].offset, displayString: cleanRound(cent).toString(), hue, opacity});
  } else {
    // from lowest to highest, relative to lowest step
    playingSteps.sort((a, b) => a.offset - b.offset);

    // cents of lowest step in that octave
    const baseStepOctave = Math.floor(playingSteps[0].offset / scale.cents.length);
    const baseStep = playingSteps[0].offset - baseStepOctave * scale.cents.length;
    const baseStepCents = scaleCents[baseStep];

    // get cents of steps relative to that lowest step
    playingSteps.forEach((stepObj) => {

      const step = stepObj.offset;

      // cents of the selected step from start of the octave it is in
      const stepOctave = Math.floor(step / scale.cents.length);
      const stepInOctave = step - stepOctave * scale.cents.length;
      const stepCents = scaleCents[stepInOctave];

      // get the cents between this step and the base like this:
      // subtract by the base step cents, add the step cents, add the octaves difference
      const octavesBetween = stepOctave - baseStepOctave;
      const displayCents = stepCents - baseStepCents + ratioToCents(scale.periodRatio[1], scale.periodRatio[0]) * octavesBetween;

      // color based on cents relative to total cents in the period
      const percentOfOctave = stepCents / ratioToCents(scale.periodRatio[1], scale.periodRatio[0]);
      const hue = percentOfOctave * 360;
      const opacity = map(stepObj.dist, 0, scale.maxSnapToCents, 1, 0.3, true);
      centItems.push({step, displayString: cleanRound(displayCents).toString(), hue, opacity});
    });
  }

  return centItems;
}


function setChannelFreqFromCoords(channel, x, y) {
  // save last
  channel.properties.lastCents = channel.properties.cents;

  // updated cents/ freq
  channel.properties.cents = setCentsFromScreenXY(channel, x, y);
  channel.synth.freq(frequency(scale.baseFrequency, channel.properties.cents));
}

function setChannelFreqFromKbd(channel, keyIndex) {
  channel.properties.kbdstep = keyIndex;

  // updated cents/ freq
  channel.properties.cents = stepOffsetToCents(keyIndex);
  channel.synth.freq(frequency(scale.baseFrequency, channel.properties.cents));
}

function setChannelFreqFromMidi(channel, midiOffset) {
  channel.properties.midiOffset = midiOffset;

  // updated cents/ freq
  channel.properties.cents = stepOffsetToCents(midiOffset);
  channel.synth.freq(frequency(scale.baseFrequency, channel.properties.cents));
}

function adjustScaleRatioFromMidiCC(scaleDeg, value) {
  if (scaleDeg == undefined || scaleDeg < 0) return;
  scale.scaleRatios[scaleDeg] = value;
  updateScaleProperties();
}

function setCentsFromScreenXY(channel, x, y) {
  // make position relative to the base note, at which cents === 0.
  x -= layout.baseX;
  y -= layout.baseY;

  // manipulate values in spiral mode to basically wrap to polar coords
  // same as in shader
  if (layout.spiralMode) {
    // get polar from cartesian coords and use them to calculate new position in spiral
    const polarRadius = createVector(x, y).mag();
    const polarAngle = Math.atan2(x, y);
    // normalize angle (1 to 0 clockwise from top)
    const polarAngleNorm = (polarAngle * 0.5) / PI + 0.5; 

    // include offset of columns from center, as seen in shader
    const baseRadius = 2 * layout.columnWidth; 

    // radius converted to position in column l-r. add effect of angle to make it spiral
    x = polarRadius - baseRadius + polarAngleNorm * (layout.columnWidth - (1 / layout.columnWidth));

    // angle converted to amount of cents added (one turn = offset between two columns normally)
    y = polarAngleNorm * layout.nextColumnOffsetCents;
  }

  // rounded to left column edge => rounded down.
  // if playing in the base column, this will be 0.
  let columnOffsetX = Math.floor(x / layout.columnWidth);
  

  // COOL, BUT PROBABLY NEEDS BETTER VISUAL AND ALSO PREVENTS JUMP DETECTION FOR SNAPPING...
  
  // add between 0-1 up or down if close to the edge for smooth transition
  // const marginPercent = 0.05;
  // const inColumnPercent = wrapNumber(x, 0, layout.columnWidth) / layout.columnWidth;
  // if (inColumnPercent < marginPercent) columnOffsetX += map(inColumnPercent, 0.0, marginPercent, -0.5, 0);
  // if (inColumnPercent > 1-marginPercent) columnOffsetX += map(inColumnPercent, 1-marginPercent, 1.0, 0, 0.5);


  // the x offset changes the cents based on the offset above
  const centsFromX = columnOffsetX * layout.nextColumnOffsetCents;
  // positive y offset descreases cents and vice versa
  const centsFromY = -y / layout.centsToPixels;

  let cents = centsFromX + centsFromY;

  // if nothing to possibly snap to, just return cents now
  if (scale.cents.length === 0 || scale.maxSnapToCents === 0) return cents;

  // try finding a snapping target and strength and update cents based on those
  updateSnappingForChannel(channel, cents);
  if (channel.properties.snapTargetCents !== undefined) {
    cents = lerp(cents, channel.properties.snapTargetCents, channel.properties.snapStrength/100);
  }

  // regardless, return cents now.
  return cents;
}

function updateSnappingForChannel(channel, cents) {

  const completelySnappedCents = getCompletelySnappedCents(cents);
  
  if (scale.alwaysForceSnap) {
    channel.properties.snapTargetCents = completelySnappedCents;
    channel.properties.snapStrength = 100;
    return;
  }

  const lastCents = channel.properties.lastCents;
  if (lastCents === undefined || Math.abs(lastCents-cents) > scale.maxSnapToCents) {
    // jumped to value outside of snap range
    // start snap to something in range
    if (completelySnappedCents !== undefined) {
      channel.properties.snapTargetCents = completelySnappedCents;
      channel.properties.snapStartCents = cents;
      channel.properties.snapStrength = 100;
    } else {
      channel.properties.snapTargetCents = undefined;
      channel.properties.snapStartCents = undefined;
      channel.properties.snapStrength = 0;
    }
  } else {
    // this might later include switch to a new target instead

    // smoothly moving and something to snap to
    if (channel.properties.snapStartCents !== undefined && completelySnappedCents !== undefined) {
      // distance from start to now compared to target
      if (channel.properties.snapTargetCents !== undefined) {
        const targetEndDistance = scale.maxSnapToCents;
        const targetCurrentDistance = Math.abs(channel.properties.snapTargetCents - cents);
        const targetStartDistance = Math.abs(channel.properties.snapTargetCents - channel.properties.snapStartCents);
        channel.properties.snapStrength = map(targetCurrentDistance, targetStartDistance, targetEndDistance, 100, 0);
      } else {
        channel.properties.snapStartCents = undefined;
        channel.properties.snapStrength = 0;
      }
      if (channel.properties.snapStrength <= 0) {
        channel.properties.snapTargetCents = undefined;
        channel.properties.snapStartCents = undefined;
        channel.properties.snapStrength = 0;
      } else if (channel.properties.snapStrength >= 100) {
        channel.properties.snapStrength = 100;
      }
    } else {
      // moved out of range
      channel.properties.snapTargetCents = undefined;
      channel.properties.snapStrength = 0;
      
    }
  }
  // hit target
  if (Math.abs(cents - completelySnappedCents) < 1) {
    channel.properties.snapTargetCents = undefined;
    channel.properties.snapStrength = undefined;
  }
}

function getCompletelySnappedCents(c) {
  const periodCents = ratioToCents(scale.periodRatio[1], scale.periodRatio[0]);
  const playedInOctaveCents = wrapNumber(c, 0, periodCents);

  const scaleOctaveCents = [...scale.cents, periodCents];

  let lastPitch = null;
  let snapToCentsInOctave = null;
  for (let i = 0; i < scaleOctaveCents.length; i++) {
    const currentPitch = scaleOctaveCents[i]
    if (i > 0 && playedInOctaveCents > lastPitch && playedInOctaveCents < currentPitch) {
      // find which one is closer and break
      if (abs(playedInOctaveCents - lastPitch) < abs(playedInOctaveCents - currentPitch)) {
        snapToCentsInOctave = lastPitch;
      } else {
        snapToCentsInOctave = currentPitch;
      }
      break;
    }
    lastPitch = currentPitch;
  }

  let snapDistance = Math.round(playedInOctaveCents - snapToCentsInOctave);
  if (Math.abs(snapDistance) < scale.maxSnapToCents || scale.alwaysForceSnap) {
    c -= snapDistance;
    return c;
  }
  // nothing to snap to
  return undefined;
}

function initChannel(channel, type, id) {
  channel.source = type;
  if (type === "pointer") channel.properties.id = id;
  channel.synth.start();
  channel.synth.amp(0);
  channel.synth.amp(soundconfig.maxAmp, soundconfig.attackDur, 0);
}

function releaseChannel(channel, releaseDuration) {
  channel.source = "release";
  channel.properties = {};
  channel.synth.amp(soundconfig.maxAmp); //weird hack, why doesnt it remember?
  channel.synth.amp(0, releaseDuration, 0); // fade back down

  // Schedule the removal of the synth after the fade-out duration
  setTimeout(() => {

    channel.synth.stop();
    channel.source = "off";

  }, releaseDuration * 1100);
  // fadeDuration converted from seconds to milliseconds
  // added a bit of extra time in order to not stop right when it SHOULD reach 0
}

function firstChannel(source) {
  for (let i = 0; i < soundsArray.length; i++) {
    if (soundsArray[i].source === source) {
      return i;
    }
  }
}

function countChannelTypes() {
  const count = {};
  soundsArray.forEach((c) => {
    if (count[c.source] === undefined) {
      count[c.source] = 0;
    }
    count[c.source]++;
  });
  return count;
}

function exactChannel(source, id) {
  if (source === "kbd") {
    for (let i = 0; i < soundsArray.length; i++) {
      const channel = soundsArray[i];
      if (channel.source === source && channel.properties.kbdstep === id) {
        return i;
      }
    }
  } else if (source === "midi") {
    for (let i = 0; i < soundsArray.length; i++) {
      const channel = soundsArray[i];
      if (channel.source === source && channel.properties.midiOffset === id) {
        return i;
      }
    }
  } else if (source === "pointer") {
    for (let i = 0; i < soundsArray.length; i++) {
      const channel = soundsArray[i];
      if (channel.source === source && channel.properties.id === id) {
        return i;
      }
    }
  }
}

function stepOffsetToCents(offset) {
  const repetitionIndex = Math.floor(offset / scale.cents.length);
  const scaleIndex = offset - repetitionIndex * scale.cents.length;
  const scaleStepCents = scale.cents[scaleIndex];
  const periodCents = ratioToCents(scale.periodRatio[1], scale.periodRatio[0]);
  return repetitionIndex * periodCents + scaleStepCents;
}

// distance between two frequencies in cents
function ratioToCents(a, b) {
  if (b === a) return 0;
  return 1200 * Math.log2(b / a);
}

// frequency after going certain distance in cents
function frequency(base, cents) {
  return base * Math.pow(2, cents / 1200);
}

function easeInCirc(x) {
  return 1 - Math.sqrt(1 - Math.pow(x, 2));
}

function wrapNumber(num, min, max) {
  const range = max - min;
  const wrappedNum = ((num - min) % range + range) % range + min;
  return wrappedNum;
}

function getPeriodReducedFractionArray(numerator, denominator) {
  let c = ratioToCents(denominator, numerator);
  const [pNumerator, pDenominator] = scale.periodRatio;
  const p = ratioToCents(pDenominator, pNumerator);

  // Multiply or divide numerator and denominator by powers of two
  while (c < 0 || c >= p) {
    if (c < 0) {
      numerator *= pNumerator;
      denominator *= pDenominator;
    } else {
      numerator *= pDenominator;
      denominator *= pNumerator;
    }
    c = ratioToCents(denominator, numerator);
  }

  return [numerator, denominator];
}

function getSimplifiedFractionArray(numerator, denominator) {
  let a = numerator;
  let b = denominator;
  let c;
  while (b) {
    c = a % b; a = b; b = c;
  }
  return [numerator / a, denominator / a];
}

function cleanRound(number) {
  if (Number.isInteger(number)) {
    return number; // No decimal places, return the original number as-is
  } else {
    return number.toFixed(1); // Round to one decimal place
  }
}



// EVENT HANDLING

function handlePointerEvent(event) {
  event.preventDefault();

  if (event.type === "pointerdown") {

    if (checkResumingAudioContext()) return;

    const channel = soundsArray[firstChannel("off")];
    if (channel !== undefined) {
      setChannelFreqFromCoords(channel, event.clientX, event.clientY);
      initChannel(channel, "pointer", event.pointerId);
      window.draw();
    }

  } else if (event.type === "pointerup") {

    const channel = soundsArray[exactChannel("pointer", event.pointerId)];
    if (channel !== undefined) {
      releaseChannel(channel, soundconfig.releaseDur);
      window.draw();
    }

  } else if (event.type === "pointercancel") {

    // darken
    fill("#00000090");
    rect(-width/2, -height/2, width, height);
    // release
    releaseAllChannels();

  } else if (event.type === "pointermove") {

    const channel = soundsArray[exactChannel("pointer", event.pointerId)];
    if (channel !== undefined) {
      setChannelFreqFromCoords(channel, event.clientX, event.clientY);
      window.draw();
    }
  }
}



function checkResumingAudioContext() {
  if (getAudioContext().state !== "running") {
    killAllChannels();
    userStartAudio().then(
      print("User audio should now be started! (check: "+ getAudioContext().state+")"),
      loop()
    );
    return true;
  }
  return false;
}

function releaseAllChannels(type) {
  if (type === undefined) {
    // just stop all
    soundsArray.forEach((channel) => {
      releaseChannel(channel, soundconfig.releaseDur);
    });
  } else {
    soundsArray.forEach((channel) => {
      if (channel.source === type) {
        releaseChannel(channel, soundconfig.releaseDur);
      }
    });
  } 
} 

function killAllChannels() {
  soundsArray.forEach((channel) => {
    channel.source = "off";
    channel.properties = {};
    channel.synth.stop();
  });
}


window.keyPressed = () => {
  if (checkResumingAudioContext()) return;
  if (settingsFocused) return;
  if (document.activeElement.type !== undefined) return

  const keyIndex = "1234567890".indexOf(key);
  if (keyIndex === -1) return;

  const channel = soundsArray[firstChannel("off")];
  if (channel !== undefined) {
    setChannelFreqFromKbd(channel, keyIndex);
    initChannel(channel, "kbd");
    window.draw();
  }
}

window.keyReleased = () => {
  const keyIndex = "1234567890".indexOf(key);
  if (keyIndex === -1) return;

  const channel = soundsArray[exactChannel("kbd", keyIndex)];
  if (channel !== undefined) {
    releaseChannel(channel, soundconfig.releaseDur);
    window.draw();
  }
  if (settingsFocused) return;
  if (document.activeElement.type !== undefined) return;
  return false; // prevent any default behavior
}



// Enable WEBMIDI.js and trigger the onEnabled() function when ready
// Check if WebMidi is supported in the browser
WebMidi.enable().then(webMidiEnabled).catch(err => console.log(err));


// Function triggered when WEBMIDI.js is ready
function webMidiEnabled() {

  webMidiLibraryEnabled = true;

  WebMidi.addListener("connected", (e) => {
    console.log("WebMidi connected:", e);
  });

  WebMidi.addListener("disconnected", (e) => {
    console.log("WebMidi disconnected:", e);
  });

  WebMidi.addListener("portschanged", (e) => {
    console.log("WebMidi ports changed:", e);
  });

  // Display available MIDI input devices
  if (WebMidi.inputs.length < 1) {
    console.log("No midi device detected")
  } else {
    WebMidi.inputs.forEach((device, index) => {
      console.log(`Midi device ${index}: ${device.name}`);
    });
  }
}

function initNewMidiInput(deviceName) {

  if (webMidiLibraryEnabled === false) return;

  // get the device. if it's not avaliable, return
  const midiInputDevice = WebMidi.getInputByName(deviceName);

  if (midiInputDevice === undefined) {
    console.log("No midi device with name \"" + deviceName + "\" was found.")
    return;
  } else {
    console.log("Connected with device: " + midiInputDevice.name)
  }

  midiInputDevice.addListener("noteon", e => {
    const whiteNoteNumberFromBase = calculateNoteNumberFromName(e.note.name, e.note.octave);

    const channel = soundsArray[firstChannel("off")];
    if (channel !== undefined) {
      setChannelFreqFromMidi(channel, whiteNoteNumberFromBase);
      initChannel(channel, "midi");
      window.draw();
    }
  });

  midiInputDevice.addListener("controlchange", e => {
    // Handle the CC messages here
    const ccNumber = e.controller.number;
    const ccValue = e.value;

    // temp effect
    if (ccNumber === 1) return;
    // mine is broken...

    // assume they start at 31, 41 and so on
    const targetScaleDeg = ccNumber % 10 - 1;

    // console.log(ccNumber, ":", ccValue);
    adjustScaleRatioFromMidiCC(targetScaleDeg, Math.floor(ccValue*127));
    
    // if note played via keyboard or midi, update channel
    //const changedStepChannel = cha
    // WIP: CHANGE PLAYING NOTES TO MATCH?
    
    window.draw();
  });

  midiInputDevice.addListener("noteoff", e => {
    const whiteNoteNumberFromBase = calculateNoteNumberFromName(e.note.name, e.note.octave);

    const channel = soundsArray[exactChannel("midi", whiteNoteNumberFromBase)];
    if (channel !== undefined) {
      channel.source = "off";
      channel.properties = {};
      channel.synth.stop();
      window.draw();
    }
    return false; // prevent any default behavior
  });
}

// Function to calculate the number value for a MIDI note
function calculateNoteNumberFromName(note, octave) {
  const noteMappings = {
    "C": 0,
    "D": 1,
    "E": 2,
    "F": 3,
    "G": 4,
    "A": 5,
    "B": 6
  };
  
  if (note in noteMappings) {
    const noteNumber = noteMappings[note];
    const octaveDistance = octave - midiSettings.baseOctave;
    const totalDistance = noteNumber + (octaveDistance * 7);
    return totalDistance;
  }
  
  return null; // Return null for invalid notes or black keys
}
