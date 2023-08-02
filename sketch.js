// PROPERTIES, STATE

// set if there was hover
let ignoreTouchEvents = false;

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
  centsToPixels: 0.5 //0.75
}
const scale = {
  baseFrequency: 110.0,
  maxSnapToCents: 40,
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

let cnv; let density = 1;
const container = document.getElementById("canvas-container");

window.setup = () => {

  // p5 setup
  cnv = createCanvas(windowWidth, windowHeight, WEBGL).parent(container);
  noLoop();
  textFont(boldMonoFont);
  rectMode(CORNERS);

  // set density
  density = displayDensity(); // 1
  if (density > 2) density = 1;
  pixelDensity(density);
  print("Display density:", density);
  print("Handling touch events. Switches to mouse events on hover.")

  // match initial window size
  resizeCanvasAndLayout();

  // GUI and settings
  const menuButton = document.getElementById("menuButton");
  const settingsDiv = document.getElementById("settingsDiv");
  const initialSettings = [
    { name: 'edo', label: 'Equal divisions of octave', initialValue: scale.equalDivisions, type: 'number', placeholder: '12, 14, 19, 31' },
    { name: 'scale', label: 'Just Intonation Scale', initialValue: scale.scaleRatios.join(":"), type: 'text', placeholder: '12:17:24, 4:5:6:7, all' },
    { name: 'mode', label: 'Mode (starting step)', initialValue: scale.mode, type: 'number', placeholder: '0, 1 ... last step of scale' },
    { name: 'basefreq', label: 'Base frequency (Hz)', initialValue: scale.baseFrequency, type: 'number', placeholder: '25.50 (low A)' },
    { name: 'period', label: 'Repetition Interval (ratio)', initialValue: scale.periodRatio.join("/"), type: 'text', placeholder: '2/1' },
    { name: 'xoffset', label: 'Column offset (cents)', initialValue: layout.nextColumnOffsetCents, type: 'number', placeholder: '200 (a tone)' },
    { name: 'height', label: 'Column height (px per cent)', initialValue: layout.centsToPixels, type: 'number', placeholder: '0.5, 0.75', step: '0.05' },
    { name: 'columnpx', label: 'Column width (px)', initialValue: layout.columnWidth, type: 'number', placeholder: '50' },
    { name: 'snaprange', label: 'Snapping height (cents)', initialValue: scale.maxSnapToCents, type: 'number', placeholder: '0, 30, 50', step: '5' },
    { name: 'waveform', label: 'Waveform', initialValue: soundconfig.waveform, type: 'text', placeholder: 'sine, square, triangle, sawtooth' },
    { name: 'delay', label: 'Delay dry/wet', initialValue: soundconfig.delayWet, type: 'number', placeholder: '0, 0.7, 1.0', step: '0.1' },
    { name: 'midiname', label: 'MIDI IN • Search device name', initialValue: midiSettings.deviceName, type: 'text', placeholder: 'Check console (F12) for options' },
    { name: 'midioctave', label: 'MIDI IN • Starting octave', initialValue: midiSettings.baseOctave, type: 'number', placeholder: '2, 3, 4' },
    // Add more objects as needed
  ];

  // initial write to the settings input
  writeSettingsFromArray(settingsDiv, initialSettings);
  // initial settings from the default inputs
  updateScaleProperties();

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
  document.addEventListener('touchcancel', () => {
    // darken
    fill("#00000090");
    rect(-width/2, -height/2, width, height);
    // release
    releaseAllChannels();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === 'visible') {
      // console.log('browser document focused (again)');
      // if (getAudioContext().state !== "running") {
      //   releaseAllChannels();
      //   window.draw();
      // }
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
    readSettingsInput(target);
  });

  // change focused state
  menuButton.addEventListener('mouseenter', () => {if (ignoreTouchEvents) menuButtonFocused = true; window.draw();});
  menuButton.addEventListener('mouseleave', () => {if (ignoreTouchEvents) menuButtonFocused = false; window.draw();});
  settingsDiv.addEventListener('mouseenter', () => {if (ignoreTouchEvents) settingsFocused = true;});
  settingsDiv.addEventListener('mouseleave', () => {if (ignoreTouchEvents) settingsFocused = false;});

  cnv.touchStarted(handleTouchStart);
  cnv.touchMoved(handleTouchMove);
  cnv.touchEnded(handleTouchEnd);


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
  layout.baseX = Math.floor(constrain(newWidth / 2 - 200, 0, newWidth * 0.25));
  layout.baseY = Math.floor(constrain(newHeight / 2, 0, newHeight)); // vertical center
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
    if (placeholder !== undefined) inputElement.placeholder = placeholder;
    if (step !== undefined) inputElement.step = step;
    inputElement.classList.add('input-field');

    groupElement.appendChild(labelElement);
    groupElement.appendChild(inputElement);
    settingsDiv.appendChild(groupElement);
  });
}

function readSettingsInput(target) {
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
      if (value > 0) layout.centsToPixels = value;
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
    default:
      console.log("Property " + name + " was not found!")
      break;
  }
  window.draw();
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
  //scaleCents = [...new Set(scaleCents)].sort((a, b) => a - b);
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
  text(scale.baseFrequency, layout.baseX + layout.columnWidth*0.5, layout.baseY - 2);

  const playingSteps = getStepsFromSoundsArray(soundsArray.filter(ch => ch.source !== "off" && ch.source !== "release"));
  // text(`${JSON.stringify(playingSteps)}`, width/2, 20);

  const fractionItems = getFractionsDisplayFromPlayingSteps(playingSteps);

  // display under the octave circle
  fractionItems.forEach((item, index) => {
    const displayText = item.ratioString ?? wrapNumber(item.step, 0, scale.cents.length).toString() ?? "?";
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
  const channelCents = soundsArray.filter(ch => ch.source !== "off" && ch.source !== "release" && ch.properties.cents !== undefined);
  const playYArray = channelCents.map(ch => yTo01(ch.properties.cents * layout.centsToPixels));
  keyboardShader.setUniform("u_playYarray", playYArray);
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
function getFractionsDisplayFromPlayingSteps(playingSteps) {
  let fractionItems = [];

  // only if nothing is playing, show the full scale instead
  if (playingSteps.length === 0) {
    scale.sortedFractions.forEach((ratioArr, index) => {
      const ratioString = ratioArr[0] + "/" + ratioArr[1];
      const cent = scale.cents[index % scale.cents.length];
      const percentOfOctave = cent / ratioToCents(scale.periodRatio[1], scale.periodRatio[0]);
      const hue = percentOfOctave * 360;
      fractionItems.push({step: index, ratioString, hue, opacity: 1});
    });
  } else if (playingSteps.length === 1) {
    const ratioArr = scale.sortedFractions[wrapNumber(playingSteps[0].offset, 0, scale.cents.length)];
    const ratioString = ratioArr[0] + "/" + ratioArr[1];
    const cent = scale.cents[wrapNumber(playingSteps[0].offset, 0, scale.cents.length)]; 
    const percentOfOctave = cent / ratioToCents(scale.periodRatio[1], scale.periodRatio[0]);
    const hue = percentOfOctave * 360;
    const opacity = map(playingSteps[0].dist, 0, scale.maxSnapToCents, 1, 0.3, true);
    fractionItems.push({step: playingSteps[0].offset, ratioString, hue, opacity});
  } else {
    // from lowest to highest, relative to lowest step
    playingSteps.sort((a, b) => a.offset - b.offset);

    // ratio of lowest step to start of that octave
    const baseStepOctave = Math.floor(playingSteps[0].offset / scale.cents.length);
    const baseStep = playingSteps[0].offset - baseStepOctave * scale.cents.length;
    const baseStepRatio = scale.sortedFractions[baseStep];

    // get ratios of steps relative to that lowest step
    playingSteps.forEach((stepObj) => {

      const step = stepObj.offset;

      // ratio of the selected step to start of the octave it is in
      const stepOctave = Math.floor(step / scale.cents.length);
      const stepInOctave = step - stepOctave * scale.cents.length;
      const stepRatio = scale.sortedFractions[stepInOctave];

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

      const ratioString = finalRatio[0] + "/" + finalRatio[1];
      // cents array is sorted just like the steps, so can be used here
      // color based on cents relative to total cents in the period
      const cent = scale.cents[stepInOctave];
      const percentOfOctave = cent / ratioToCents(scale.periodRatio[1], scale.periodRatio[0]);
      const hue = percentOfOctave * 360;
      const opacity = map(stepObj.dist, 0, scale.maxSnapToCents, 1, 0.3, true);
      fractionItems.push({step, ratioString, hue, opacity});
    });
  }
  return fractionItems;
}


function setChannelFreqFromCoords(channel, x, y, initType, id) {

  // save last
  channel.properties.lastCents = channel.properties.cents;

  // set new cents
  channel.properties.cents = undefined;
  const channelCents = setCentsFromScreenXY(channel, x, y);
  channel.properties.cents = channelCents;

  // set freq
  channel.synth.freq(frequency(scale.baseFrequency, channelCents));

  // make new channel if started
  if (initType !== undefined) initChannel(channel, initType, id);
}

function setChannelFreqFromKbd(channel, keyIndex) {

  channel.properties.kbdstep = keyIndex;

  // set new cents
  const channelCents = stepOffsetToCents(keyIndex);
  channel.properties.cents = channelCents;

  // set freq
  channel.synth.freq(frequency(scale.baseFrequency, channelCents));
}

function setChannelFreqFromMidi(channel, midiOffset) {

  channel.properties.midiOffset = midiOffset;

  // set new cents
  const channelCents = stepOffsetToCents(midiOffset);
  channel.properties.cents = channelCents;

  // set freq
  channel.synth.freq(frequency(scale.baseFrequency, channelCents));
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

  // rounded to left column edge => rounded down.
  // if playing in the base column, this will be 0.
  let columnOffsetX = Math.floor(x / layout.columnWidth);
  // add between 0-1 up or down if close to the edge for smooth transition
  const marginPercent = 0.05;
  const inColumnPercent = wrapNumber(x, 0, layout.columnWidth) / layout.columnWidth;
  if (inColumnPercent < marginPercent) columnOffsetX += map(inColumnPercent, 0.0, marginPercent, -0.5, 0);
  if (inColumnPercent > 1-marginPercent) columnOffsetX += map(inColumnPercent, 1-marginPercent, 1.0, 0, 0.5);

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
  const lastCents = channel.properties.lastCents;
  const completelySnappedCents = getCompletelySnappedCents(cents, lastCents);
  
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
  if (Math.abs(snapDistance) < scale.maxSnapToCents) {
    c -= snapDistance;
    return c;
  }
  // nothing to snap to
  return undefined;
}

function initChannel(channel, type, id) {
  channel.source = type;
  if (type === "touch") channel.properties.id = id;
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
  } else if (source === "touch") {
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

function outsideCanvas(x, y) {
  if (x < 0) return true
  if (x > width) return true
  if (y < 0) return true
  if (y > height) return true
}

function handleTouchStart(event) {
  event.preventDefault();
  if (checkResumingAudioContext()) return;

  event.changedTouches.forEach((touch) => {
    const id = touch.identifier;
    const x = touch.clientX; const y = touch.clientY - 0;
    if (outsideCanvas(x, y)) return;
    
    const channel = soundsArray[firstChannel("off")];
    if (channel !== undefined) {
      setChannelFreqFromCoords(channel, x, y, "touch", id);

      window.draw();
    }
  })
}

function handleTouchMove(event) {
  event.preventDefault();
  event.changedTouches.forEach((touch) => {
    const id = touch.identifier;
    const x = touch.clientX; const y = touch.clientY - 0;
    if (outsideCanvas(x, y)) return;
    
    const channel = soundsArray[exactChannel("touch", id)];
    if (channel !== undefined) {
      setChannelFreqFromCoords(channel, x, y);
  
      window.draw();
    }
  })
}

function handleTouchEnd(event) {
  event.preventDefault();
  event.changedTouches.forEach((touch) => {
    const id = touch.identifier;
    //const x = touch.clientX; const y = touch.clientY - 60;
    
    const channel = soundsArray[exactChannel("touch", id)];
    if (channel !== undefined) {
      releaseChannel(channel, soundconfig.releaseDur);

      // if there are playing touches still, but none on the screen, stop all
      if (countChannelTypes().touch > 0 && event.touches.length === 0) {
        releaseAllChannels("touch");
      }
      
      window.draw();
    }
  })
}

window.mouseMoved = () => {
  if (!ignoreTouchEvents && !navigator.maxTouchPoints > 0) {
    ignoreTouchEvents = true;
    print("mouse move detected: mouse/desktop mode:", ignoreTouchEvents);
  }
}

window.mouseDragged = () => {
  if (settingsFocused || menuButtonFocused) return;
  if (!ignoreTouchEvents)
    return;
  if (outsideCanvas(mouseX, mouseY))
    return;

  const channel = soundsArray[firstChannel("mouse")];
  if (channel !== undefined) {
    setChannelFreqFromCoords(channel, mouseX, mouseY);

    window.draw();
  }
};

window.mousePressed = () => {
  if (checkResumingAudioContext()) return;
  if (settingsFocused || menuButtonFocused) return;
  if (!ignoreTouchEvents) return
  if (outsideCanvas(mouseX, mouseY)) return;
  
  const channel = soundsArray[firstChannel("off")];
  if (channel !== undefined) {
    setChannelFreqFromCoords(channel, mouseX, mouseY, "mouse");

    window.draw();
  }
}

window.mouseReleased = () => {
  if (!ignoreTouchEvents) return
  
  const channel = soundsArray[firstChannel("mouse")];
  if (channel !== undefined) {
    releaseChannel(channel, soundconfig.releaseDur);
    
    window.draw();
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
