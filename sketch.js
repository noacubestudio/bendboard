let cnv; let tallBuffer;
const container = document.getElementById("canvas-container");

let mouseDown = false;
let isMouse = false;
let totalKbd = 0;
let totalTouches = 0;


// sound settings
let lpFilter; let delayFilter;
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

// function randomizeScale() {
//   scale.equalDivisions = random([12, 14, 19, 24, 31]);
//   scale.scaleRatios = random([[24, 27, 30, 32, 36, 40, 45, 48], [4, 5, 6, 7, 8]]);
//   scale.mode = Math.floor(random(baseRatioChord.length+1));
//   scale.cents = getScaleFromRatioChord(ratioChordMode(baseRatioChord, scale.mode));
// }


window.setup = () => {
  cnv = createCanvas(windowWidth, windowHeight).parent(container);
  tallBuffer = createGraphics(windowWidth/layout.columnCount, windowHeight);
  resizeEverything(isMouse);


  // GUI and settings
  const menuButton = document.getElementById("menuButton");
  const settingsInput = document.getElementById("settingsInput");

  // initial write to the settings input
  writeToInput(settingsInput);

  // show/hide the settings input
  menuButton.addEventListener("click", (event) => {
    event.stopPropagation();
    if (settingsInput.style.display === 'none') {
      settingsInput.style.display = 'block';
    } else {
      settingsInput.style.display = 'none';
    }
  });

  // read the settings input if it changed and make changes
  settingsInput.addEventListener("input", (event) => {
    const editedText = event.target.value;
    readInput(editedText);
  });

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
  delayFilter.drywet(0.7);

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

function writeToInput(input) {
  input.value = "";
  input.value += "edo " + scale.equalDivisions + "\n";
  input.value += "scale " + scale.scaleRatios.join(":") + "\n";
  input.value += "mode " + scale.mode + "\n";
  input.value += "base " + scale.baseFrequency + " hz" + "\n";
  input.value += "octavesize " + scale.octaveSizeCents + " cents" + "\n";
  input.value += "xoffset " + layout.nextColumnOffsetCents + " cents" + "\n";
  input.value += "height " + layout.centsToPixels + " cents per pixel";
}

function readInput(value) {
  const lines = value.split("\n");

  lines.forEach((line) => {
    const words = line.trim().split(" ");
    if (words.length > 0 && words[0].length > 0) {
      switch (words[0]) {
        case "edo":
          const newEDO = Number(words[1]);
          if (newEDO !== undefined && !isNaN(newEDO) && newEDO > 1) scale.equalDivisions = newEDO;
          break;
        case "scale":
          if (words[1] !== undefined) {
            const newScaleRatios = words[1].split(":");
            if (newScaleRatios.length >= 2 && newScaleRatios.every((element) => typeof element === "number")) {
              scale.scaleRatios = newScaleRatios;
            }
          } else {
            scale.scaleRatios = [];
          }
          setScale();
          break;
        case "mode":
          const newMode = Number(words[1]);
          if (newMode !== undefined && !isNaN(newMode)) scale.mode = newMode;
          setScale();
          break;
        case "base":
          const newBase = Number(words[1]);
          if (newBase !== undefined && !isNaN(newBase)) scale.baseFrequency = newBase;
          break;
        case "octavesize":
          const newOctaveSize = Number(words[1]);
          if (newOctaveSize !== undefined && !isNaN(newOctaveSize) && newOctaveSize > 100) scale.octaveSizeCents = newOctaveSize;
          resizeEverything(isMouse);
          break;
        case "xoffset":
          const newOffsetCents = Number(words[1]);
          if (newOffsetCents !== undefined && !isNaN(newOffsetCents) && newOffsetCents > 0) layout.nextColumnOffsetCents = newOffsetCents;
          resizeEverything(isMouse);
          break;
        case "height":
          const newCentsToPixels = Number(words[1]);
          if (newCentsToPixels !== undefined && !isNaN(newCentsToPixels)) scale.centsToPixels = newCentsToPixels;
          resizeEverything(isMouse);
          break;
        default:
          print("Property " + words[0] + "was not found!")
          break;
      }
    }
  });

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

  const approxColWidth = (newWidth > 768) ? 50 : 30;
  layout.columnCount = Math.floor(width/approxColWidth);

  const offsetCents = layout.nextColumnOffsetCents * (layout.columnCount-1);
  const totalHeight = newHeight + offsetCents * layout.centsToPixels;
  tallBuffer.resizeCanvas(Math.floor(newWidth / layout.columnCount), totalHeight, false);
}

function getScaleFromRatioChord(ratioChord) {
  const scaleCents = [];
  for (let i = 1; i < ratioChord.length; i++) {
    const newCents = cents(ratioChord[0], ratioChord[i])
    scaleCents.push(newCents);
  }
  if (scaleCents[scaleCents.length-1] === scale.octaveSizeCents) {
    // remove last and add 0 at start
    scaleCents.pop();
    scaleCents.unshift(0);
  }
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

  // // button
  // textAlign(CENTER, CENTER);

  // fill("#333");
  // rect(4, 4, 56, 46, 4);
  // fill("white");
  // text("Rand.", 30, 25);

  // push();
  // translate(60, 0);
  // fill("#333");
  // rect(4, 4, 56, 46, 4);
  // fill("white");
  // text("Snap", 30, 16);
  // text(scale.maxSnapToCents, 30, 34);


  // translate(50, 0);
  // textSize(10);
  // // textAlign(LEFT, BOTTOM);


  // let scaleText = scale.equalDivisions + " edo, scale chord";
  // scale.scaleRatios.forEach((num, index) => {
  //   scaleText += (index > 0 ? ":" : " ") + num;
  // });
  // text(scaleText, 14, 14);

  // pop();

  noStroke();
}

function drawColumn(buffer) {
  buffer.push();
  // go to bottom
  buffer.background("black");
  buffer.textSize(10);
  buffer.textAlign(CENTER, CENTER);

  // loop upwards, adding everything until height reached
  const totalCents = buffer.height / layout.centsToPixels //height / layout.centsToPixels + layout.nextColumnOffsetCents * (layout.columnCount-1);

  // add simple grid
  buffer.stroke("#333");
  let gridCents = 0;
  while (gridCents < totalCents) {
    gridCents += scale.octaveSizeCents / scale.equalDivisions;
    const yPos = map(gridCents, 0, totalCents, buffer.height, 0);
    buffer.line(buffer.width*0.05, yPos, buffer.width*0.95, yPos);
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
        const octave = 1 + octCents / scale.octaveSizeCents;
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
      buffer.text(Math.round(channel.properties.cents % scale.octaveSizeCents), 0.5 * buffer.width, yPos - 15);
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