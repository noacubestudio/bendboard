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
  // columns
  nextColumnOffsetCents: 200,
  columnsOffsetX: 0, //WIP, BROKEN
  idealWidth: 50,
  columnCount: 12, // set in resizeEverything
  // in column
  centsToPixels: 0.75
}
const scale = {
  baseFrequency: 27.50,
  maxSnapToCents: 30,
  equalDivisions: 12,
  octaveSizeCents: 1200, // range used for scales and EDO
  scaleRatios: [24, 27, 30, 32, 36, 40, 45, 48],
  mode: 0,
  cents: [], // temp, gets set by scale ratios and mode
  //chordSteps: [-8, 0, 2, 4]
}

function ratioChordMode(chordArray, modeOffset) {
  if (chordArray.length <= 1) return chordArray;

  modeOffset = modeOffset % (chordArray.length - 1);
  if (modeOffset <= 0) return chordArray;

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
  tallBuffer = createGraphics(windowWidth/layout.columnCount, windowHeight);
  resizeEverything(isMouse);

  // GUI and settings
  const menuButton = document.getElementById("menuButton");
  const settingsDiv = document.getElementById("settingsDiv");
  const initialSettings = [
    { name: 'edo', label: 'Equal divisions of octave', initialValue: scale.equalDivisions, type: 'number', placeholder: '12, 14, 19, 31' },
    { name: 'scale', label: 'Scale', initialValue: scale.scaleRatios.join(":"), type: 'text', placeholder: '12:17:24, 4:5:6:7, all' },
    { name: 'mode', label: 'Mode of scale', initialValue: scale.mode, type: 'number', placeholder: '0, 1 ... last step of scale' },
    { name: 'basefreq', label: 'Base frequency (Hz)', initialValue: scale.baseFrequency, type: 'number', placeholder: '25.50 (low A)' },
    { name: 'octavecents', label: 'Octave size (cents)', initialValue: scale.octaveSizeCents, type: 'number', placeholder: '1200' },
    { name: 'xoffset', label: 'Column offset (cents)', initialValue: layout.nextColumnOffsetCents, type: 'number', placeholder: '200 (a tone)' },
    { name: 'height', label: 'Column height (px per cent)', initialValue: layout.centsToPixels, type: 'number', placeholder: '0.5, 0.75', step: '0.05' },
    { name: 'columnpx', label: 'Min. Column width (px)', initialValue: layout.idealWidth, type: 'number', placeholder: '50' },
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
    readSettingsInput(target.name, target.value);
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

function readSettingsInput(name, value) {
    if (value === undefined || value.length === 0) return;

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
        const newMode = Number(value);
        if (!isNaN(newMode)) scale.mode = newMode;
        setScale();
        break;
      case "basefreq":
        const newBase = Number(value);
        if (!isNaN(newBase)) scale.baseFrequency = newBase;
        break;
      case "octavecents":
        const newOctaveSize = Number(value);
        if (!isNaN(newOctaveSize) && newOctaveSize > 100) scale.octaveSizeCents = newOctaveSize;
        setScale();
        resizeEverything(isMouse);
        break;
      case "xoffset":
        const newOffsetCents = Number(value);
        if (!isNaN(newOffsetCents) && newOffsetCents > 0) layout.nextColumnOffsetCents = newOffsetCents;
        resizeEverything(isMouse);
        break;
      case "height":
        const newCentsToPixels = Number(value);
        if (!isNaN(newCentsToPixels) && newCentsToPixels > 0) layout.centsToPixels = newCentsToPixels;
        resizeEverything(isMouse);
        break;
      case "columnpx":
        const newIdealWidth = Number(value);
        if (!isNaN(newIdealWidth) && newIdealWidth > 10 && newIdealWidth < width) layout.idealWidth = newIdealWidth;
        resizeEverything(isMouse);
        break;
      case "snaprange":
        const newMaxSnap = Number(value);
        if (!isNaN(newMaxSnap) && newMaxSnap >= 0) scale.maxSnapToCents = newMaxSnap;
        break;
      case "waveform":
        const newWaveForm = value;
        if (["sine", "square", "triangle","sawtooth"].includes(newWaveForm)) {
          waveform = newWaveForm;
          for (let i = 0; i < channels.length; i++) {
            channels[i].synth.setType(waveform);
          }
        }
        break;
      case "delay":
        const newWet = Number(value);
        if (!isNaN(newWet) && newWet > 0) {
          delayWet = newWet;
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
    scale.cents = getScaleCentsFromEDO(scale.equalDivisions, scale.octaveSizeCents);
  }
}

window.windowResized = () => {
  resizeEverything(isMouse);
  window.draw();
}

function resizeEverything(isMouse) {
  let newHeight = windowHeight;
  let newWidth = windowWidth;
  if (isMouse) {
    newWidth-=16;
  }

  resizeCanvas(newWidth, newHeight, false);

  const approxColWidth = (newWidth > 768) ? layout.idealWidth : layout.idealWidth * 0.6;
  layout.columnCount = Math.floor(width/approxColWidth);

  const offsetCents = layout.nextColumnOffsetCents * (layout.columnCount-1);
  const totalHeight = newHeight + offsetCents * layout.centsToPixels;
  tallBuffer.resizeCanvas(Math.floor(newWidth / layout.columnCount), totalHeight, false);
}

function getScaleFromRatioChord(ratioChord) {
  let scaleCents = [];
  for (let i = 0; i < ratioChord.length; i++) {
    const newCents = cents(ratioChord[0], ratioChord[i]) % scale.octaveSizeCents;
    scaleCents.push(newCents);
  }
  scaleCents = [...new Set(scaleCents)].sort((a, b) => a - b);
  return scaleCents;
}

function getScaleCentsFromEDO(edo, octaveSize) {
  const scaleCents = [];
  for (let i = 0; i < edo; i++) {
    scaleCents.push((octaveSize / edo) * i);
  }
  return scaleCents;
}

window.draw = () => {

  background("#000");
 
  drawKeyboard();

  drawOctaveCircle();

  // let scaleText = scale.equalDivisions + " edo, scale chord";
  // scale.scaleRatios.forEach((num, index) => {
  //   scaleText += (index > 0 ? ":" : " ") + num;
  // });
  // text(scaleText, 14, 14);

  // pop();

  noStroke();
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
  if (scale.scaleRatios !== undefined && scale.scaleRatios.length > 0) {
    stroke("#333");
    let stepCents = 0;
    while (stepCents < scale.octaveSizeCents) {
      stepCents += scale.octaveSizeCents / scale.equalDivisions;
      const percentOfOctave = stepCents / scale.octaveSizeCents;
      const angle = -90 + percentOfOctave * 360;
      const outerX = radius * cos(radians(angle));
      const outerY = radius * sin(radians(angle));
      line(0, 0, outerX, outerY);
    }
  }

  // scale
  scale.cents.forEach((cent) => {
    const percentOfOctave = cent / scale.octaveSizeCents;
    const hue = percentOfOctave * 360;
    const angle = -90 + percentOfOctave * 360;
    const outerX = radius * cos(radians(angle));
    const outerY = radius * sin(radians(angle));
    stroke(chroma.oklch(0.6, 0.2, hue).hex()); // Set line color
    line(0, 0, outerX, outerY);
  });

  strokeWeight(1);
  stroke("white");

  // playing
  channels.forEach((channel) => {
    if (channel.source !== "off" && channel.properties.cents !== undefined) {
      // draw line for played cent
      const percentOfOctave = (channel.properties.cents % scale.octaveSizeCents) / scale.octaveSizeCents;
      const angle = -90 + percentOfOctave * 360;
      const outerX = radius * cos(radians(angle));
      const outerY = radius * sin(radians(angle));
      line(0, 0, outerX, outerY);
    }
  });

  noStroke();;
  fill("#FFFFFFB0");
  triangle(radius, -radius, radius, -radius+10, radius-10, -radius);
  pop();
}

function drawColumn(buffer) {
  buffer.push();
  // go to bottom
  buffer.background("black");
  buffer.textSize(10);
  buffer.textAlign(CENTER, CENTER);

  // loop upwards, adding everything until height reached
  const totalCents = buffer.height / layout.centsToPixels //height / layout.centsToPixels + layout.nextColumnOffsetCents * (layout.columnCount-1);

  // add simple grid, only if there is a scale as well
  // if there is no scale, then all notes are visible so this isn't needed
  if (scale.scaleRatios !== undefined && scale.scaleRatios.length > 0) {
    buffer.stroke("#333");
    let gridCents = 0;
    while (gridCents < totalCents) {
      gridCents += scale.octaveSizeCents / scale.equalDivisions;
      const yPos = map(gridCents, 0, totalCents, buffer.height, 0);
      buffer.line(buffer.width*0.05, yPos, buffer.width*0.95, yPos);
    }
  }

  // scale pitches
  for (let octCents = 0; octCents < totalCents; octCents += scale.octaveSizeCents) {
    scale.cents.forEach((cent) => {
      const combinedCent = octCents + cent;
      const inOctaveHue = (cent / scale.octaveSizeCents) * 360;
      buffer.strokeWeight(1);
      buffer.stroke(chroma.oklch(0.6, 0.2, inOctaveHue).hex());
      const yPos = map(combinedCent, 0, totalCents, buffer.height, 0);
      buffer.line(buffer.width*0.05, yPos, buffer.width*0.95, yPos);
      buffer.strokeWeight(6);
      buffer.line(buffer.width*0.3, yPos, buffer.width*0.7, yPos);

      if (cent === 0) {
        const octave = octCents / scale.octaveSizeCents;
        buffer.stroke("black");
        buffer.fill("white");
        buffer.text(octave, buffer.width*0.5, yPos);
      }
    });
  }

  // playing
  channels.forEach((channel) => {
    if (channel.source !== "off" && channel.properties.cents !== undefined) {
      // draw line for played cent
      buffer.strokeWeight(1);
      buffer.stroke("white");
      const yPos = map(channel.properties.cents, 0, totalCents, buffer.height, 0);
      buffer.line(0, yPos, buffer.width, yPos);
      buffer.strokeWeight(4);
      buffer.line(buffer.width*0.05, yPos, buffer.width*0.25, yPos);
      buffer.line(buffer.width*0.75, yPos, buffer.width*0.95, yPos);
      buffer.noStroke();
      buffer.fill("white");
      buffer.text(Math.round(channel.properties.cents) % scale.octaveSizeCents, 0.5 * buffer.width, yPos - 15);
    }
  });

  buffer.strokeWeight(1);
  buffer.pop();
}

function drawKeyboard() {
  const columnWidth = width / layout.columnCount;
  const offsetCents = layout.nextColumnOffsetCents * (layout.columnCount-1);

  drawColumn(tallBuffer);

  for (let x = 0; x < layout.columnCount; x++) {
    const y = Math.round(map(x, 0, layout.columnCount-1, 0, offsetCents * layout.centsToPixels));
    image(tallBuffer, x * columnWidth, - tallBuffer.height + height + y);
  }

  noStroke();
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
  const channelCents = channel.properties.kbdstep * (scale.octaveSizeCents / scale.equalDivisions);
  channel.properties.cents = channelCents;

  // set freq
  channel.synth.freq(frequency(scale.baseFrequency, channelCents));
}

function setCentsFromScreenXY(channel, x, y) {
  const lastCents = channel.properties.lastCents;
  const gridX = Math.floor((x/width)*layout.columnCount);
  const yInCents = (height-y)/layout.centsToPixels;
  let cents = layout.nextColumnOffsetCents * (gridX + layout.columnsOffsetX) + yInCents;

  if (scale.cents.length >= 1 && scale.maxSnapToCents > 0) {
    let completelySnappedCents = snapToCents(cents, lastCents);

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
  
    // set
    if (channel.properties.snapTargetCents !== undefined) {
      cents = lerp(cents, channel.properties.snapTargetCents, channel.properties.snapStrength/100);
    }
  }
  return cents;
}

function snapToCents(cents) {
  const playedInOctaveCents = cents % scale.octaveSizeCents;
  const scaleOctaveCents = [...scale.cents, scale.octaveSizeCents];

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
  //if (snapToCentsInOctave === scale.octaveSizeCents) snapToCentsInOctave = 0;

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