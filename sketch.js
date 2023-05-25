let cnv; let tallBuffer;
const container = document.getElementById("canvas-container");

let mouseDown = false;
let isMouse = false;
let totalKbd = 0;
let totalTouches = 0;

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
  baseX: 200,
  baseY: 700,
  // per column
  nextColumnOffsetCents: 200,
  // width and height
  columnWidth: 50,
  centsToPixels: 0.5 //0.75
}
const scale = {
  baseFrequency: 55.0,
  maxSnapToCents: 30,
  equalDivisions: 12,
  periodCents: 1200, // range used for scales and EDO
  scaleRatios: [24, 27, 30, 32, 36, 40, 45, 48],
  mode: 0,
  cents: [], // temp, gets set by scale ratios and mode
  //chordSteps: [-8, 0, 2, 4]
}

function ratioChordMode(chordArray, modeOffset) {
  if (chordArray.length <= 1) return chordArray;

  modeOffset = modeOffset % (chordArray.length - 1);
  if (modeOffset <= 0) return chordArray;

  if (chordArray[chordArray.length-1] !== chordArray[0]) {
    chordArray.push(chordArray[0] * 2);
  }

  const modeArray = [];
  chordArray.forEach((num, index) => {
    if (index <= modeOffset) {
      // these numbers will be doubled
      modeArray[index + (chordArray.length-1) - modeOffset] = num * 2;
    } 
    if (index >= modeOffset) {
      modeArray[index-modeOffset] = num;
    }
  });
  return modeArray;
}

window.setup = () => {
  cnv = createCanvas(windowWidth, windowHeight).parent(container);
  tallBuffer = createGraphics(layout.columnWidth, windowHeight);
  resizeEverything(isMouse);

  // GUI and settings
  const menuButton = document.getElementById("menuButton");
  const settingsDiv = document.getElementById("settingsDiv");
  const initialSettings = [
    { name: 'edo', label: 'Equal divisions of octave', initialValue: scale.equalDivisions, type: 'number', placeholder: '12, 14, 19, 31' },
    { name: 'scale', label: 'Just Intonation Scale', initialValue: scale.scaleRatios.join(":"), type: 'text', placeholder: '12:17:24, 4:5:6:7, all' },
    { name: 'mode', label: 'Mode (starting step)', initialValue: scale.mode, type: 'number', placeholder: '0, 1 ... last step of scale' },
    { name: 'basefreq', label: 'Base frequency (Hz)', initialValue: scale.baseFrequency, type: 'number', placeholder: '25.50 (low A)' },
    { name: 'period', label: 'Repetition Interval (cents)', initialValue: scale.periodCents, type: 'number', placeholder: '1200' },
    { name: 'xoffset', label: 'Column offset (cents)', initialValue: layout.nextColumnOffsetCents, type: 'number', placeholder: '200 (a tone)' },
    { name: 'height', label: 'Column height (px per cent)', initialValue: layout.centsToPixels, type: 'number', placeholder: '0.5, 0.75', step: '0.05' },
    { name: 'columnpx', label: 'Column width (px)', initialValue: layout.columnWidth, type: 'number', placeholder: '50' },
    { name: 'snaprange', label: 'Snapping height (cents)', initialValue: scale.maxSnapToCents, type: 'number', placeholder: '0, 30, 50', step: '5' },
    { name: 'waveform', label: 'Waveform', initialValue: waveform, type: 'text', placeholder: 'sine, square, triangle, sawtooth' },
    { name: 'delay', label: 'Delay Dry/Wet', initialValue: delayWet, type: 'number', placeholder: '0, 0.7, 1.0', step: '0.1' },
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

  // read the settings input if it changed and make changes
  settingsDiv.addEventListener("input", (event) => {
    const target = event.target;
    readSettingsInput(target.name, target.value, target.type);
  });

  // change focused state
  menuButton.addEventListener('mouseenter', () => {if (isMouse) menuButtonFocused = true; window.draw();});
  menuButton.addEventListener('mouseleave', () => {if (isMouse) menuButtonFocused = false; window.draw();});
  settingsDiv.addEventListener('mouseenter', () => {if (isMouse) settingsFocused = true;});
  settingsDiv.addEventListener('mouseleave', () => {if (isMouse) settingsFocused = false;});

  // initial settings from the default inputs
  setScale();

  cnv.touchStarted(handleTouchStart);
  cnv.touchMoved(handleTouchMove);
  cnv.touchEnded(handleTouchEnd);
  cnv.mouseOver(handleMouseOver);

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
  textFont('monospace');
  rectMode(CORNERS);
  tallBuffer.textFont('monospace');
  tallBuffer.rectMode(CORNERS);
  tallBuffer.strokeJoin(ROUND)

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

function readSettingsInput(name, value, type) {
    if (value === undefined || value.length === 0) return;
    if (type === "number") value = Number(value);

    switch (name) {
      case "edo":
        if (value > 0) scale.equalDivisions = value;
        // regenerate all cents if no specific scale used
        if (scale.scaleRatios.length === 0) setScale();
        break;
      case "scale":
        if (["all"].includes(value)) {
          scale.scaleRatios = [];
          setScale();
        } else {
          const newScaleRatios = value.split(":");
          if (newScaleRatios.length >= 1 && newScaleRatios.every((element) => (Number(element) > 0))) {
            scale.scaleRatios = newScaleRatios.map(Number);
            setScale();
          }
        }
        break;
      case "mode":
        scale.mode = value;
        setScale();
        break;
      case "basefreq":
        scale.baseFrequency = value;
        break;
      case "period":
        if (value > 50) scale.periodCents = value;
        setScale();
        resizeEverything(isMouse);
        break;
      case "xoffset":
        layout.nextColumnOffsetCents = value;
        resizeEverything(isMouse);
        break;
      case "height":
        if (value > 0) layout.centsToPixels = value;
        resizeEverything(isMouse);
        break;
      case "columnpx":
        if (value > 10 && value < width) layout.columnWidth = value;
        resizeEverything(isMouse);
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
      default:
        print("Property " + name + " was not found!")
        break;
    }

  window.draw();
}

function setScale() {
  if (scale.scaleRatios.length > 0) {
    scale.cents = getScaleFromRatioChord(ratioChordMode(scale.scaleRatios, scale.mode));
  } else {
    scale.cents = getScaleCentsFromEDO(scale.equalDivisions, scale.periodCents);
  }
}

window.windowResized = () => {
  resizeEverything(isMouse);
  window.draw();
}

function resizeEverything(isMouse) {
  // set new dimensions, resize canvas, but don't draw yet.
  // on PC, leave some room for the scrollbar.
  let newHeight = windowHeight;
  let newWidth = (isMouse) ? windowWidth - 16 : windowWidth;
  resizeCanvas(newWidth, newHeight, false);

  // based on layout settings, figure out how tall the buffer for the keyboard visual needs to be.
  // this height is the screen height plus space for all visible offsets.
  // each offset, positive or negative, is associated with a certain height in cents and ultimately pixels.

  // first of all, find out how many columns are at least partially visible.
  const visibleColumnCount = Math.ceil(newWidth / layout.columnWidth);

  // besides the starting column, each adds an absolute offset in cents.
  // then convert to pixels, adding the height of one column in full.
  const offsetCents = Math.abs(layout.nextColumnOffsetCents) * (visibleColumnCount-1);
  const totalHeight = newHeight + offsetCents * layout.centsToPixels;
  tallBuffer.resizeCanvas(layout.columnWidth, totalHeight, false);
}

function getScaleFromRatioChord(ratioChord) {
  let scaleCents = [];
  for (let i = 0; i < ratioChord.length; i++) {
    const newCents = cents(ratioChord[0], ratioChord[i]) % scale.periodCents;
    scaleCents.push(newCents);
  }
  scaleCents = [...new Set(scaleCents)].sort((a, b) => a - b);
  return scaleCents;
}

function getScaleCentsFromEDO(edo, periodCents) {
  const scaleCents = [];
  const stepSize = 1200 / edo;
  const stepCount = Math.ceil(periodCents / stepSize);
  for (let i = 0; i < stepCount; i++) {
    scaleCents.push(stepSize * i);
  }
  return scaleCents;
}

window.draw = () => {

  background("#000");
  noStroke();
 
  drawKeyboard();

  drawOctaveCircle();

  // let scaleText = scale.equalDivisions + " edo, scale chord";
  // scale.scaleRatios.forEach((num, index) => {
  //   scaleText += (index > 0 ? ":" : " ") + num;
  // });
  // text(scaleText, 14, 14);

  // fill("white")
  // text(scale.cents, 100, 24);

  // stroke("red")
  // line(layout.baseX, layout.baseY, layout.baseX + layout.columnWidth, layout.baseY)
}

function drawOctaveCircle() {

  const radius = menuButtonFocused ? 38 : 36;

  push();
  translate(radius+10, radius+10);

  strokeWeight(25);
  fill("#000000C0");
  stroke("#000");
  ellipse(0, 0, radius*2, radius*2);
  

  // add simple grid, only if there is a scale as well
  // if there is no scale, then all notes are visible so this isn't needed
  strokeWeight(2);
  if (scale.scaleRatios.length > 0) {
    stroke("#333");
    const stepCount = Math.ceil(scale.periodCents / (1200 / scale.equalDivisions));
    for (let c = 0; c < stepCount; c++) {
      const stepCents = c * (1200 / scale.equalDivisions);
      const percentOfPeriod = stepCents / scale.periodCents;
      const angle = -90 + percentOfPeriod * 360;
      const outerX = radius * cos(radians(angle));
      const outerY = radius * sin(radians(angle));
      line(0, 0, outerX, outerY);
    }
  }

  // scale
  scale.cents.forEach((cent) => {
    const percentOfOctave = cent / scale.periodCents;
    const hue = percentOfOctave * 360;
    const angle = -90 + percentOfOctave * 360;
    const outerX = radius * cos(radians(angle));
    const outerY = radius * sin(radians(angle));
    stroke(chroma.oklch(0.6, 0.2, hue).hex()); // Set line color
    line(0, 0, outerX, outerY);
  });

  stroke("white");

  // playing
  channels.forEach((channel) => {
    if (channel.source !== "off" && channel.properties.cents !== undefined) {
      // draw line for played cent
      const percentOfOctave = (channel.properties.cents % scale.periodCents) / scale.periodCents;
      const angle = -90 + percentOfOctave * 360;
      const outerX = radius * cos(radians(angle));
      const outerY = radius * sin(radians(angle));
      strokeWeight(1);
      line(0, 0, outerX, outerY);
      strokeWeight(6);
      line(outerX, outerY, outerX, outerY);
    }
  });

  noStroke();;
  fill("#FFFFFFB0");
  triangle(radius, -radius, radius, -radius+10, radius-10, -radius);
  pop();
}

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
  buffer.fill("#111");
  buffer.noStroke();
  buffer.ellipse(buffer.width * 0.5, columnCentsToPixels(centsUnderBase),buffer.width);

  // get list of period starting positions
  const periodCents = [];
  const visibleRepetitionsDown = Math.ceil(centsUnderBase / scale.periodCents);
  const visibleRepetitionsUp = Math.ceil(centsAboveBase / scale.periodCents);
  for (let r = -visibleRepetitionsDown; r < visibleRepetitionsUp; r++) {
    periodCents.push(r * scale.periodCents);
  }
  const basePeriodIndex = visibleRepetitionsDown;
  // print(visibleRepetitionsDown, visibleRepetitionsUp, periodCents)

  // for every repetition range...
  periodCents.forEach((pc, index) => {
    const centsFromBottom = pc + centsUnderBase;

    drawEDOGrid(centsFromBottom, scale.periodCents);

    drawRatioScale(centsFromBottom, scale.periodCents, index - basePeriodIndex);
  });

  function drawEDOGrid(repStartCents, periodCents) {
    // no scale ratios = all notes will be colored, so this grid won't show up.
    if (scale.scaleRatios.length === 0) return;

    buffer.stroke("#333");
    buffer.strokeWeight(1);

    const stepCount = Math.ceil(scale.periodCents / (1200 / scale.equalDivisions));
    for (let c = 0; c < stepCount; c++) {
      const centsAboveRep = (c / scale.equalDivisions) * 1200;
      const pixelsY = columnCentsToPixels(repStartCents + centsAboveRep);
      buffer.line(buffer.width*0.05, pixelsY, buffer.width*0.95, pixelsY);
    }
  }

  function drawRatioScale(repStartCents, periodCents, repetitionIndex) {
    scale.cents.forEach((centsAboveRep) => {
      const inOctaveHue = (centsAboveRep / periodCents) * 360;
      buffer.strokeWeight(1);
      buffer.stroke(chroma.oklch(0.6, 0.2, inOctaveHue).hex());
      const pixelsY = columnCentsToPixels(repStartCents + centsAboveRep);
      buffer.line(buffer.width*0.05, pixelsY, buffer.width*0.95, pixelsY);
      buffer.strokeWeight(6);
      buffer.line(buffer.width*0.3, pixelsY, buffer.width*0.7, pixelsY);

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
      buffer.text(Math.round(channel.properties.cents) % scale.periodCents, 0.5 * buffer.width, yPos - 15);
    }
  });
}

function drawKeyboard() {
  // use the buffer that covers the entire height in cents to tile the canvas.
  // actually generate the tall image to cover the canvas with
  drawColumn(tallBuffer);

  // x position of slices
  // can be a bit outside the left edge

  const firstColumnX = layout.baseX - layout.columnWidth * Math.ceil(layout.baseX / layout.columnWidth);
  
  const columnX = (i) => {return firstColumnX + i * layout.columnWidth};
  
  // y position of slices (as in, the top of the slice)
  // positive offset: starts at the very bottom (minus screen height) and goes up in offset intervals 
  // negative offset: starts at the very top and goes down in offset intervals
  const columnY = (i) => {
    if (layout.nextColumnOffsetCents === 0) return 0;
    if (layout.nextColumnOffsetCents > 0) {
      const firstColumnY = -tallBuffer.height + height;
      return firstColumnY + i * layout.nextColumnOffsetCents * layout.centsToPixels;
    } 
    const firstColumnY = 0;
    return firstColumnY - i * layout.nextColumnOffsetCents * layout.centsToPixels;
  }

  // loop until number of partially visible columns reached
  const columnCount = Math.ceil(width / layout.columnWidth);
  for (let i = 0; i < columnCount; i++) {
    image(tallBuffer, columnX(i), columnY(i));
  }
}

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

function setFromKbd(channel, position) {
  channel.properties.kbdstep = position - 1;
  const channelCents = channel.properties.kbdstep * (scale.periodCents / scale.equalDivisions);
  channel.properties.cents = channelCents;

  // set freq
  channel.synth.freq(frequency(scale.baseFrequency, channelCents));
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

function getCompletelySnappedCents(cents) {
  const playedInOctaveCents = cents % scale.periodCents;
  const scaleOctaveCents = [...scale.cents, scale.periodCents];

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
    cents -= snapDistance;
    return cents;
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

function exactChannel(source, id) {
  if (source === "kbd") {
    for (let i = 0; i < channels.length; i++) {
      const channel = channels[i];
      if (channel.source === source && channel.properties.kbdsteo === id -1) {
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

function countInputs() {
  let total = totalKbd + totalTouches;
  if (mouseDown) total++;
  return total;
}

// distance between two frequencies in cents
function cents(a, b) {
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

function handleTouchStart(event) {
  if (event.touches !== undefined) totalTouches = event.touches.length;
  userStartAudio();
  event.preventDefault();

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
  if (event.touches !== undefined) totalTouches = event.touches.length;
  event.changedTouches.forEach((touch) => {
    const id = touch.identifier;
    //const x = touch.clientX; const y = touch.clientY - 60;
    
    const channel = channels[exactChannel("touch", id)];
    if (channel !== undefined) {
      channel.source = "off";
      channel.properties = {};
      channel.synth.stop();

      // stop all
      if (countInputs() === 0) {
        channels.forEach((channel) => {
          channel.properties = {};
          channel.source = "off";
          channel.synth.stop();
        })
      }
      
      window.draw();
    }
  })
}

window.mouseDragged = () => {
  if (settingsFocused || menuButtonFocused) return;
  if (!isMouse)
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
  if (settingsFocused || menuButtonFocused) return;
  userStartAudio();
  if (!isMouse) return
  if (outsideCanvas(mouseX, mouseY)) return;
  
  mouseDown = true;
  
  const channel = channels[firstChannel("off")];
  if (channel !== undefined) {
    setFromScreenXY(channel, mouseX, mouseY, "mouse");

    window.draw();
  }
}

window.mouseReleased = () => {
  if (!isMouse) return
  mouseDown = false;
  
  const channel = channels[firstChannel("mouse")];
  if (channel !== undefined) {
    channel.source = "off";
    channel.properties = {};
    channel.synth.stop();
    if (countInputs() === 0) {
      channels.forEach((channel) => {
        channel.properties = {}
        channel.source = "off";
        channel.synth.stop();
      });
    }
    
    window.draw();
  }
}

function handleMouseOver() {
  if (!isMouse) {
    isMouse = true;
    resizeEverything(isMouse);
  }
}

window.keyPressed = () => {
  if (settingsFocused) return;
  if (document.activeElement.type !== undefined) return
  if (!"1234567890".includes(key)) return
  userStartAudio();
  totalKbd++;
  
  const position = (key === "0") ? 10 : Number(key);

  const channel = channels[firstChannel("off")];
  if (channel !== undefined) {
    setFromKbd(channel, position);
    channel.source = "kbd";
    channel.synth.start();
    window.draw();
  }
}

window.keyReleased = () => {
  if (settingsFocused) return;
  if (document.activeElement.type !== undefined) return
  if (!"1234567890".includes(key)) return
  totalKbd--;
  const position = (key === "0") ? 10 : Number(key);

  const channel = channels[exactChannel("kbd", position)];
  if (channel !== undefined) {
    channel.source = "off";
    channel.properties = {};
    channel.synth.stop();
    window.draw();
  }
  return false; // prevent any default behavior
}