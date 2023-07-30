//enableWebGL2(window.p5)

let cnv; let density = 1;
const container = document.getElementById("canvas-container");
let boldMonoFont;

let mouseDown = false;
let usingMouse = false; //!(window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0);

let audioStarted = false;
let webMidiLibraryEnabled = false;

let totalKbd = 0;
let totalTouches = 0;
let totalMidi = 0;

let settingsFocused = false;
let menuButtonFocused = false;


// sound settings
let lpFilter; let delayFilter;
let delayWet = 0.7;
let waveform = "sawtooth";

const channels = [];
// initialed with 10 channels, 
// each contains:
// - synth object
// - source type: off, kbd, touch, mouse, ref. (off = filled again first before starting a new synth)
// - properties: cents (from basenote)


const layout = {
  // start point
  baseX: 0, // set based on screen dimensions
  baseY: 0, // set based on screen dimensions
  // per column
  nextColumnOffsetCents: 200,
  // width and height
  columnWidth: 50,
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

let keyboardShader;

window.preload = () => {

  boldMonoFont = loadFont('iAWriterQuattroS-Bold.ttf');
  keyboardShader = loadShader('shader.vert', 'shader.frag');
}

window.setup = () => {
  cnv = createCanvas(windowWidth, windowHeight, WEBGL).parent(container);


  // disables scaling for retina screens which can create inconsistent scaling between displays
  // HIGHER RESOLUTION OPTION:
  density = displayDensity();

  pixelDensity(density);
  resizeEverything(usingMouse);
  print("Display density:", density, "mouse/desktop mode:", usingMouse);

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
    { name: 'waveform', label: 'Waveform', initialValue: waveform, type: 'text', placeholder: 'sine, square, triangle, sawtooth' },
    { name: 'delay', label: 'Delay dry/wet', initialValue: delayWet, type: 'number', placeholder: '0, 0.7, 1.0', step: '0.1' },
    { name: 'midiname', label: 'MIDI IN • Search device name', initialValue: midiSettings.deviceName, type: 'text', placeholder: 'Check console (F12) for options' },
    { name: 'midioctave', label: 'MIDI IN • Starting octave', initialValue: midiSettings.baseOctave, type: 'number', placeholder: '2, 3, 4' },
    // Add more objects as needed
  ];

  // initial write to the settings input
  writeSettingsFromArray(settingsDiv, initialSettings);

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

  // read the settings input if it changed and make changes
  settingsDiv.addEventListener("input", (event) => {
    const target = event.target;
    stopAllChannels("midi");
    stopAllChannels("kbd");
    readSettingsInput(target);
  });

  // change focused state
  menuButton.addEventListener('mouseenter', () => {if (usingMouse) menuButtonFocused = true; window.draw();});
  menuButton.addEventListener('mouseleave', () => {if (usingMouse) menuButtonFocused = false; window.draw();});
  settingsDiv.addEventListener('mouseenter', () => {if (usingMouse) settingsFocused = true;});
  settingsDiv.addEventListener('mouseleave', () => {if (usingMouse) settingsFocused = false;});

  // initial settings from the default inputs
  updateScaleProperties();

  cnv.touchStarted(handleTouchStart);
  cnv.touchMoved(handleTouchMove);
  cnv.touchEnded(handleTouchEnd);

  lpFilter = new p5.BandPass();
  lpFilter.res(1);
  lpFilter.freq(220);

  // reverb = new p5.Reverb();
  // reverb.disconnect();
  // reverb.process(lpFilter, 1.5, 2);
  // reverb.connect(lpFilter);

  delayFilter = new p5.Delay();
  delayFilter.process(lpFilter, 0.18, .6, 2300);
  delayFilter.setType(1);
  delayFilter.drywet(delayWet);

  noLoop();
  textFont(boldMonoFont);
  rectMode(CORNERS);

  // initialize all channels
  for (let i = 0; i < 10; i++) {
    
    let source = "off";
    let synth = new p5.Oscillator();
    let properties = {};

    synth.disconnect();
    synth.connect(lpFilter);
    synth.setType(waveform);
    synth.freq(scale.baseFrequency)
    synth.amp(0.5);

    channels.push({synth: synth, source: source, properties: properties});
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
          resizeEverything(usingMouse);
        }
      } else if (!isNaN(value)) {
        if (Number(value) > 1) {
          scale.periodRatio = [Number(value), 1];
          updateScaleProperties();
          resizeEverything(usingMouse);
        }
      }
      break;
    case "xoffset":
      layout.nextColumnOffsetCents = value;
      resizeEverything(usingMouse);
      break;
    case "height":
      if (value > 0) layout.centsToPixels = value;
      resizeEverything(usingMouse);
      break;
    case "columnpx":
      if (value > 10 && value < width) layout.columnWidth = value;
      resizeEverything(usingMouse);
      break;
    case "snaprange":
      if (value >= 0) scale.maxSnapToCents = value;
      break;
    case "waveform":
      if (["sine", "square", "triangle","sawtooth"].includes(value)) {
        waveform = value;
        for (let i = 0; i < channels.length; i++) {
          channels[i].synth.setType(waveform);
        }
      }
      break;
    case "delay":
      if (value > 0) {
        delayWet = value;
        delayFilter.drywet(delayWet);
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
  const maxModeNum = fractionsArr.length-1; // this should realistically take the actual number of unique notes and the right order too...
  modeNum = wrapNumber(modeNum, 0, maxModeNum);
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

window.windowResized = () => {
  resizeEverything(usingMouse);
  window.draw();
}

function resizeEverything(isMouse) {
  // set new dimensions, resize canvas, but don't draw yet.
  // on PC, leave some room for the scrollbar.
  let newHeight = (isMouse) ? windowHeight - 6 : windowHeight;
  let newWidth = (isMouse) ? windowWidth - 6 : windowWidth;
  resizeCanvas(newWidth, newHeight, false);

  // set the starting point (initial frequency) somewhere in this area
  layout.baseX = Math.floor(constrain(newWidth / 2 - 200, 0, newWidth * 0.25));
  layout.baseY = Math.floor(constrain(newHeight / 2, 0, newHeight)); // vertical center
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

  drawShader();
  resetShader();

  // go to top left
  push();
  translate(-width/2, -height/2);

  // for some reason, this really slowed down my browser unless full performance is used, which can not be controlled.
  // shall be re-implemented in shader instead. 
  
  // drawOctaveCircle();

  fill("white");
  textAlign(CENTER, CENTER);

  scale.sortedFractions.forEach((ratioArr, index) => {
    const ratioString = ratioArr[0] + "/" + ratioArr[1];
    const cent = scale.cents[index % scale.cents.length];
    const percentOfOctave = cent / ratioToCents(scale.periodRatio[1], scale.periodRatio[0]);
    const hue = percentOfOctave * 360;
    fill(chroma.oklch(0.8, 0.2, hue).hex()); // Set line color
    stroke("black");
    strokeWeight(8);
    text(`${ratioString}`, 46,  100 + index * 20);
  })
  strokeWeight(1);

  //text(`${JSON.stringify(countChannelTypes())}`, width - 20, height - 20);

  //overlay if audio not started
  if (!audioStarted) {
    fill("#00000090");
    rect(0, 0, width, height);
    fill("white");
    textAlign(CENTER, CENTER);
    text("CLICK OR TAP TO START", width/2, height/2);
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
  const channelCents = channels.filter(ch => ch.source !== "off" && ch.properties.cents !== undefined);
  const playYArray = channelCents.map(ch => yTo01(ch.properties.cents * layout.centsToPixels));
  keyboardShader.setUniform("u_playYarray", playYArray);
  keyboardShader.setUniform("u_playYarrayLength", playYArray.length);

  //circle
  const radius = menuButtonFocused ? 38 : 36;
  keyboardShader.setUniform("u_circlePos", vecTo01([radius+10, radius+10]));
  keyboardShader.setUniform("u_circleRadius", yTo01(radius));

  rect(0,0,width,height);

  drawingContext.depthMask(false);
  drawingContext.disable(drawingContext.DEPTH_TEST);
}

// function drawOctaveCircle() {

//   const radius = menuButtonFocused ? 38 : 36;

//   push();
//   translate(radius+10, radius+10);

//   // add simple grid, only if there is a scale as well
//   // if there is no scale, then all notes are visible so this isn't needed
//   strokeWeight(2);
//   if (scale.scaleRatios.length > 0) {
//     stroke("#333");
//     const stepCount = Math.ceil(ratioToCents(scale.periodRatio[1], scale.periodRatio[0]) / (1200 / scale.equalDivisions));
//     for (let c = 0; c < stepCount; c++) {
//       const stepCents = c * (1200 / scale.equalDivisions);
//       const percentOfPeriod = stepCents / ratioToCents(scale.periodRatio[1], scale.periodRatio[0]);
//       push();
//       rotate(radians(percentOfPeriod * 360));
//       line(0, 0, 0, -radius);
//       pop();
//     }
//   }

//   // scale
//   scale.cents.forEach((cent) => {
//     const percentOfOctave = cent / ratioToCents(scale.periodRatio[1], scale.periodRatio[0]);
//     const hue = percentOfOctave * 360;
//     stroke(chroma.oklch(0.7, 0.25, hue).hex()); // Set line color
//     push();
//     rotate(radians(percentOfOctave * 360));
//     line(0, 0, 0, -radius);
//     pop();
//   });

//   stroke("white");

//   // playing
//   channels.forEach((channel) => {
//     if (channel.source !== "off" && channel.properties.cents !== undefined) {
//       // draw line for played cent
//       const periodCents = ratioToCents(scale.periodRatio[1], scale.periodRatio[0]);
//       const percentOfOctave = (channel.properties.cents % periodCents) / periodCents;
      
//       push();

//       rotate(radians(percentOfOctave * 360));
//       strokeWeight(1);
//       line(0, 0, 0, -radius);
//       strokeWeight(6);
//       line(0, -radius*0.94, 0, -radius*0.95);

//       pop();
//     }
//   });

//   noStroke();;
//   // fill("#FFFFFFB0");
//   // triangle(radius, -radius, radius, -radius+10, radius-10, -radius);
//   pop();
// }

function drawColumn(buffer) {
  buffer.background("black");
  buffer.textSize(10);
  buffer.textAlign(CENTER, CENTER);
  buffer.strokeWeight(1);

  // get the number of columns and thus offsets under and over the baseX column
  const columnsUnderBase = Math.ceil(layout.baseX / layout.columnWidth);
  const xCentsUnderBase = columnsUnderBase * layout.nextColumnOffsetCents
  const yCentsUnderBase = (height-layout.baseY) / layout.centsToPixels;

  const totalCents = buffer.height / layout.centsToPixels;
  const centsUnderBase = xCentsUnderBase + yCentsUnderBase;
  const centsAboveBase = totalCents - centsUnderBase;

  const columnCentsToPixels = (cents) => {return map(cents, 0, totalCents, buffer.height, 0)};

  // mark base spot


  // get list of period starting positions
  const periodCentsArr = [];
  const periodCents = ratioToCents(scale.periodRatio[1], scale.periodRatio[0]);
  const visibleRepetitionsDown = Math.ceil(centsUnderBase / periodCents);
  const visibleRepetitionsUp = Math.ceil(centsAboveBase / periodCents);
  for (let r = -visibleRepetitionsDown; r < visibleRepetitionsUp; r++) {
    periodCentsArr.push(r * periodCents);
  }
  const basePeriodIndex = visibleRepetitionsDown;

  // for every repetition range...
  periodCentsArr.forEach((pc, index) => {
    const centsFromBottom = pc + centsUnderBase;

    drawEDOGrid(centsFromBottom, periodCents);

    drawRatioScale(centsFromBottom, periodCents, index - basePeriodIndex);
  });

  function drawEDOGrid(repStartCents, periodCents) {
    // no scale ratios = all notes will be colored, so this grid won't show up.
    if (scale.scaleRatios.length === 0) return;

    buffer.stroke("#333");
    buffer.strokeWeight(1);

    const stepCount = Math.ceil(periodCents / (1200 / scale.equalDivisions));
    for (let c = 0; c < stepCount; c++) {
      const centsAboveRep = (c / scale.equalDivisions) * 1200;
      const pixelsY = columnCentsToPixels(repStartCents + centsAboveRep);
      buffer.line(buffer.width*0.05, pixelsY, buffer.width*0.95, pixelsY);
    }
  }

  function drawRatioScale(repStartCents, periodCents, repetitionIndex) {
    scale.cents.forEach((centsAboveRep) => {
      //background circle
      if (centsAboveRep === 0) {
        buffer.fill((repetitionIndex === 0) ? "#FFFFFF18" : "#FFFFFF10");
        buffer.noStroke();
        buffer.ellipse(buffer.width * 0.5, columnCentsToPixels(repStartCents), buffer.width);
      }

      // draw colored line
      const inOctaveHue = (centsAboveRep / periodCents) * 360;
      buffer.strokeWeight(1);
      buffer.stroke(chroma.oklch(0.6, 0.2, inOctaveHue).hex());
      const pixelsY = columnCentsToPixels(repStartCents + centsAboveRep);
      buffer.line(buffer.width*0.05, pixelsY, buffer.width*0.95, pixelsY);
      buffer.strokeWeight(6);
      buffer.line(buffer.width*0.3, pixelsY, buffer.width*0.7, pixelsY);

      // octave number on top
      if (centsAboveRep === 0) {
        buffer.stroke("black");
        buffer.fill("white");
        buffer.text(repetitionIndex, buffer.width*0.5, pixelsY);
      }
    });
  }

  // playing
  channels.forEach((channel) => {
    if (channel.source !== "off" && channel.properties.cents !== undefined) {
      // draw line for played cent
      buffer.strokeWeight(1);
      buffer.stroke("white");
      const yPos = map(channel.properties.cents + centsUnderBase, 0, totalCents, buffer.height, 0);
      buffer.line(0, yPos, buffer.width, yPos);
      buffer.strokeWeight(4);
      buffer.line(buffer.width*0.05, yPos, buffer.width*0.25, yPos);
      buffer.line(buffer.width*0.75, yPos, buffer.width*0.95, yPos);
      buffer.noStroke();
      buffer.fill("white");
      buffer.text(cleanRound(channel.properties.cents % periodCents), 0.5 * buffer.width, yPos - 15);
    }
  });
}


// function drawKeyboard() {
//   // use the buffer that covers the entire height in cents to tile the canvas.
//   // actually generate the tall image to cover the canvas with
//   drawColumn(tallBuffer);

//   // x position of slices
//   // can be a bit outside the left edge

//   const firstColumnX = layout.baseX - layout.columnWidth * Math.ceil(layout.baseX / layout.columnWidth);
  
//   const columnX = (i) => {return firstColumnX + i * layout.columnWidth};
  
//   // y position of slices (as in, the top of the slice)
//   // positive offset: starts at the very bottom (minus screen height) and goes up in offset intervals 
//   // negative offset: starts at the very top and goes down in offset intervals
//   const columnY = (i) => {
//     if (layout.nextColumnOffsetCents === 0) return 0;
//     if (layout.nextColumnOffsetCents > 0) {
//       const firstColumnY = -tallBuffer.height + height;
//       return firstColumnY + i * layout.nextColumnOffsetCents * layout.centsToPixels;
//     } 
//     const firstColumnY = 0;
//     return firstColumnY - i * layout.nextColumnOffsetCents * layout.centsToPixels;
//   }

//   // loop until number of partially visible columns reached
//   const columnCount = Math.ceil(width / layout.columnWidth);
//   for (let i = 0; i < columnCount; i++) {
//     image(tallBuffer, columnX(i), columnY(i));
//   }
// }

function setFromScreenXY(channel, x, y, initType, id) {

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

function setFromKbd(channel, keyIndex) {

  channel.properties.kbdstep = keyIndex;

  const setCentsFromScaleIndex = (index) => {
    const repetitionIndex = Math.floor(index / scale.cents.length);
    const scaleStepCents = scale.cents[index % scale.cents.length];
    const periodCents = ratioToCents(scale.periodRatio[1], scale.periodRatio[0]);
    return repetitionIndex * periodCents + scaleStepCents;
  }

  // set new cents
  const channelCents = setCentsFromScaleIndex(keyIndex);
  channel.properties.cents = channelCents;

  // set freq
  channel.synth.freq(frequency(scale.baseFrequency, channelCents));
}

function setFromMidi(channel, midiOffset) {

  channel.properties.midiOffset = midiOffset;

  const setCentsFromOffset = (offset) => {
    const repetitionIndex = Math.floor(offset / scale.cents.length);
    const scaleIndex = offset - repetitionIndex * scale.cents.length;
    const scaleStepCents = scale.cents[scaleIndex];
    const periodCents = ratioToCents(scale.periodRatio[1], scale.periodRatio[0]);
    return repetitionIndex * periodCents + scaleStepCents;
  }

  // set new cents
  const channelCents = setCentsFromOffset(midiOffset);
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
  const columnOffsetX = Math.floor(x / layout.columnWidth);

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
}

function firstChannel(source) {
  for (let i = 0; i < channels.length; i++) {
    if (channels[i].source === source) {
      return i;
    }
  }
}

function countChannelTypes() {
  const count = {};
  channels.forEach((c) => {
    if (count[c.source] === undefined) {
      count[c.source] = 0;
    }
    count[c.source]++;
  });
  return count;
}

function exactChannel(source, id) {
  if (source === "kbd") {
    for (let i = 0; i < channels.length; i++) {
      const channel = channels[i];
      if (channel.source === source && channel.properties.kbdstep === id) {
        return i;
      }
    }
  } else if (source === "midi") {
    for (let i = 0; i < channels.length; i++) {
      const channel = channels[i];
      if (channel.source === source && channel.properties.midiOffset === id) {
        return i;
      }
    }
  } else if (source === "touch") {
    for (let i = 0; i < channels.length; i++) {
      const channel = channels[i];
      if (channel.source === source && channel.properties.id === id) {
        return i;
      }
    }
  }
}

function outsideCanvas(x, y) {
  if (x < 0) return true
  if (x > width) return true
  if (y < 0) return true
  if (y > height) return true

  // if (x < 60 && y < 50) {
  //   // menu
  //   randomizeScale();
  //   window.draw();
  //   return true;
  // }
  // if (x < 120 && y < 50) {
  //   // menu
  //   changeSnapping();
  //   window.draw();
  //   return true;
  // }
}

function changeSnapping() {
  scale.maxSnapToCents += 15;
  scale.maxSnapToCents = scale.maxSnapToCents % 60;
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
  const range = max - min + 1;
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



function handleTouchStart(event) {
  event.preventDefault();
  if (initializeAudioStep()) return;

  event.changedTouches.forEach((touch) => {
    const id = touch.identifier;
    const x = touch.clientX; const y = touch.clientY - 0;
    if (outsideCanvas(x, y)) return;
    
    const channel = channels[firstChannel("off")];
    if (channel !== undefined) {
      setFromScreenXY(channel, x, y, "touch", id);

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
    
    const channel = channels[exactChannel("touch", id)];
    if (channel !== undefined) {
      setFromScreenXY(channel, x, y);
  
      window.draw();
    }
  })
}

function handleTouchEnd(event) {
  event.preventDefault();
  event.changedTouches.forEach((touch) => {
    const id = touch.identifier;
    //const x = touch.clientX; const y = touch.clientY - 60;
    
    const channel = channels[exactChannel("touch", id)];
    if (channel !== undefined) {
      channel.source = "off";
      channel.properties = {};
      channel.synth.stop();

      // if there are playing touches still, but none on the screen, stop all
      if (countChannelTypes().touch > 0 && event.touches.length === 0) {
        stopAllChannels("touch");
      }
      
      window.draw();
    }
  })
}

window.mouseMoved = () => {
  if (!usingMouse) {
    usingMouse = true;
    resizeEverything(usingMouse);
    window.draw();
    print("mouse move detected: mouse/desktop mode:", usingMouse);
  }
  
}

window.mouseDragged = () => {
  if (settingsFocused || menuButtonFocused) return;
  if (!usingMouse)
    return;
  if (outsideCanvas(mouseX, mouseY))
    return;

  const channel = channels[firstChannel("mouse")];
  if (channel !== undefined) {
    setFromScreenXY(channel, mouseX, mouseY);

    window.draw();
  }
};

window.mousePressed = () => {
  if (initializeAudioStep()) return;
  if (settingsFocused || menuButtonFocused) return;
  if (!usingMouse) return
  if (outsideCanvas(mouseX, mouseY)) return;
  
  mouseDown = true;
  
  const channel = channels[firstChannel("off")];
  if (channel !== undefined) {
    setFromScreenXY(channel, mouseX, mouseY, "mouse");

    window.draw();
  }
}

window.mouseReleased = () => {
  if (!usingMouse) return
  mouseDown = false;
  
  const channel = channels[firstChannel("mouse")];
  if (channel !== undefined) {
    channel.source = "off";
    channel.properties = {};
    channel.synth.stop();
    
    window.draw();
  }
}

function initializeAudioStep() {
  if (!audioStarted) {
    userStartAudio();
    audioStarted = true;
    window.draw();
    return true;
  }
  return false;
}

function stopAllChannels(type) {
  if (type === undefined) {
    // just stop all
    channels.forEach((channel) => {
      channel.properties = {};
      channel.source = "off";
      channel.synth.stop();
    });
  } else {
    channels.forEach((channel) => {
      if (channel.source === type) {
        channel.properties = {};
        channel.source = "off";
        channel.synth.stop();
      }
    });
  } 
} 


window.keyPressed = () => {
  if (initializeAudioStep()) return;
  if (settingsFocused) return;
  if (document.activeElement.type !== undefined) return

  const keyIndex = "1234567890".indexOf(key);
  if (keyIndex === -1) return;

  totalKbd++;

  const channel = channels[firstChannel("off")];
  if (channel !== undefined) {
    setFromKbd(channel, keyIndex);
    channel.source = "kbd";
    channel.synth.start();
    window.draw();
  }
}

window.keyReleased = () => {
  if (settingsFocused) return;
  if (document.activeElement.type !== undefined) return

  const keyIndex = "1234567890".indexOf(key);
  if (keyIndex === -1) return;

  totalKbd--;

  const channel = channels[exactChannel("kbd", keyIndex)];
  if (channel !== undefined) {
    channel.source = "off";
    channel.properties = {};
    channel.synth.stop();
    window.draw();
  }
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
    totalMidi++;

    const whiteNoteNumberFromBase = calculateNoteNumberFromName(e.note.name, e.note.octave);

    const channel = channels[firstChannel("off")];
    if (channel !== undefined) {
      setFromMidi(channel, whiteNoteNumberFromBase);
      channel.source = "midi";
      channel.synth.start();
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
    totalMidi--;

    const whiteNoteNumberFromBase = calculateNoteNumberFromName(e.note.name, e.note.octave);

    const channel = channels[exactChannel("midi", whiteNoteNumberFromBase)];
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

// function enableWebGL2(p) {
//   p.RendererGL.prototype._initContext = function () {
//     try {
//       this.drawingContext =
//         this.canvas.getContext("webgl2", this._pInst._glAttributes) ||
//         this.canvas.getContext("webgl", this._pInst._glAttributes) ||
//         this.canvas.getContext("experimental-webgl", this._pInst._glAttributes)
//       if (this.drawingContext === null) {
//         throw new Error("Error creating webgl context")
//       } else {
//         const gl = this.drawingContext
//         gl.enable(gl.DEPTH_TEST)
//         gl.depthFunc(gl.LEQUAL)
//         gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
//         this._viewport = this.drawingContext.getParameter(this.drawingContext.VIEWPORT)
//         // gl.enable(gl.SAMPLE_COVERAGE)
//         // gl.sampleCoverage(0.2, true)
//       }
//     } catch (er) {
//       throw er
//     }
//   }
// }