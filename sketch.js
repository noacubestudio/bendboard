let cnv; let tallBuffer;
const container = document.getElementById("canvas-container");


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
  nextColumnOffsetCents: cents(24, 27),
  columnsOffsetX: 0,
  columnCount: 22,
  // in column
  bottomCents: 0,
  topCents: 100 * 11.5
}
const scale = {
  baseFrequency: 55,
  maxSnapToCents: 50, // wip unused
  equalDivisions: 24,
  octaveSizeCents: 1200, // range used for scales and EDO
  ratioChord: [24, 27, 30, 32, 36, 40, 45, 48],
  cents: [0, 200, 400, 600, 700, 900, 1100] // temp, gets set by ratioChord
}


window.setup = () => {
  cnv = createCanvas(windowWidth, windowHeight).parent(container);
  tallBuffer = createGraphics(windowWidth/layout.columnCount, height);
  resizeEverything(isMouse);

  updateScaleFromRatioChord(scale.ratioChord)
  
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

window.windowResized = () => {
  resizeEverything(isMouse);
}

function resizeEverything(isMouse) {
  let newHeight = windowHeight;
  let newWidth = windowWidth;
  if (isMouse) {
    newHeight-=10; newWidth-=10;
  }

  resizeCanvas(newWidth, newHeight, false);

  const totalCents = layout.bottomCents + layout.topCents + layout.nextColumnOffsetCents * (layout.columnCount-1);
  const totalHeight = map(totalCents, layout.bottomCents, layout.topCents, 0, newHeight);
  print("Resized to: " + newWidth + ", " + newHeight + (isMouse ? " in desktop mode" : "."));
  tallBuffer.resizeCanvas(newWidth / layout.columnCount, totalHeight, false);

  draw();
}

function updateScaleFromRatioChord(ratioChord) {
  scale.cents = [];
  for (let i = 1; i < ratioChord.length; i++) {
    const newCents = cents(ratioChord[0], ratioChord[i])
    scale.cents.push(newCents);
  }
}

let playedCents = []; // via mouse/touch/kbd

function updatePlayed() {
  playedCents = [];

  // push sound channels that are on to the array of played steps
  channels.forEach((channel, index)=>{
    if (channel.source !== "off") {
      const cent = channel.properties.cents;
      if (cent !== undefined) {
        playedCents.push(cent);
      }
    }
  });
}

window.draw = () => {

  updatePlayed();

  background("#000");
  textSize(10);
  fill("white");

  drawKeyboard();

  let scaleText = scale.equalDivisions + " edo, scale chord";
  scale.ratioChord.forEach((num, index) => {
    scaleText += (index > 0 ? ":" : " ") + num;
  });
  text(scaleText, 14, 14);

  let centsText = "scale in cents:";
  scale.cents.forEach((cent) => {
    centsText += " " + Math.round(cent);
  });
  fill("#FFFFFF70");
  text(centsText, 14, 14 * 2);

  text("height in cents: " + layout.topCents + ", offset per column: " + layout.nextColumnOffsetCents.toFixed(1), 14, 14 * 3);
}

function drawColumn(buffer) {
  buffer.push();
  // go to bottom
  buffer.translate(0, buffer.height);
  buffer.background("#000");
  buffer.textSize(10);
  buffer.textAlign(CENTER, CENTER);
  buffer.fill("white");

  // loop upwards, adding everything until height reached
  const totalCents = layout.bottomCents + layout.topCents + layout.nextColumnOffsetCents * (layout.columnCount-1);

  buffer.stroke("#333");

  // add simple grid
  let gridCents = 0;
  while (gridCents < totalCents) {
    gridCents += scale.octaveSizeCents / scale.equalDivisions;
    const yPos = map(gridCents, 0, totalCents, 0, -buffer.height);
    buffer.line(buffer.width*0.05, yPos, buffer.width*0.95, yPos);
  }

  // scale pitches
  for (let octCents = 0; octCents < totalCents; octCents += scale.octaveSizeCents) {
    scale.cents.forEach((cent) => {
      const combinedCent = octCents + cent;
      const inOctaveHue = (cent / scale.octaveSizeCents) * 360;
      buffer.strokeWeight(1);
      buffer.stroke(chroma.oklch(0.6, 0.2, inOctaveHue).hex());
      const yPos = map(combinedCent, 0, totalCents, 0, -buffer.height);
      buffer.line(buffer.width*0.05, yPos, buffer.width*0.95, yPos);
      buffer.strokeWeight(4);
      buffer.line(buffer.width*0.3, yPos, buffer.width*0.7, yPos);
    });
  }

  // playing
  playedCents.forEach((playedCent) => {
    buffer.strokeWeight(1);
    buffer.stroke("white");
    const yPos = map(playedCent, 0, totalCents, 0, -buffer.height);
    buffer.line(0, yPos, buffer.width, yPos);
    buffer.strokeWeight(4);
    buffer.line(buffer.width*0.05, yPos, buffer.width*0.25, yPos);
    buffer.line(buffer.width*0.75, yPos, buffer.width*0.95, yPos);
    buffer.noStroke();
    buffer.fill("white");
    buffer.text(Math.round(playedCent % scale.octaveSizeCents), 0.5 * buffer.width, yPos - 15);
  });

  buffer.strokeWeight(1);
  buffer.pop();
}

function drawKeyboard() {
  const columnWidth = width / layout.columnCount;
  const totalCents = layout.bottomCents + layout.topCents + layout.nextColumnOffsetCents * (layout.columnCount-1);
  const totalHeight = map(totalCents, layout.bottomCents, layout.topCents, 0, height);

  drawColumn(tallBuffer);

  for (let x = 0; x < layout.columnCount; x++) {
    const y = map(layout.nextColumnOffsetCents*x, layout.bottomCents, layout.topCents, totalHeight-height, totalHeight-height*2);
    image(tallBuffer, x * columnWidth, 0, columnWidth, height, 0, y, columnWidth, height);
  }
}

let mouseDown = false;
let isMouse = false;
let totalKbd = 0;
let totalTouches = 0;

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
    //print(touch)
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
      if (countInputs() === 0) {
        channels.forEach((channel, index) => {
          if (index !== 0) {channel.properties = {}}
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
      channels.forEach((channel, index) => {
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

function setFromScreenXY(channel, x, y, initType, id) {

  channel.properties.cents = undefined;

  if (scale.cents.length >= 1) {
    const channelCents = setCentsFromScreenXY(x, y);
    channel.properties.cents = channelCents;

    // set freq
    channel.synth.freq(frequency(scale.baseFrequency, channelCents));
    if (initType !== undefined) initChannel(channel, initType, id);
  }
}

function setFromKbd(channel, position) {
  channel.properties.kbdstep = position - 1;
  const channelCents = channel.properties.kbdstep * (scale.octaveSizeCents / scale.equalDivisions);
  channel.properties.cents = channelCents;

  // set freq
  channel.synth.freq(frequency(scale.baseFrequency, channelCents));
}

function setCentsFromScreenXY(x, y) {
  const gridX = Math.floor((x/width)*layout.columnCount);
  const cents = layout.nextColumnOffsetCents * (gridX + layout.columnsOffsetX) + map(y, height, 0, layout.bottomCents, layout.topCents);
  return cents;
}

function setEdoStepFromScreenXY(x, y) {
  const gridX = (x/width)*colCount;
  const gridY = (1-y/height)*rowCount;
  const gridXYedoStep = (Math.floor(gridX) + edoStepStartX) * nextColumnCentsOffset + (Math.floor(gridY) + edoStepStartY) * yStep;

  return gridXYedoStep;
}

function setGlideFromScreenY(y) {
  const gridY = (1-y/height)*rowCount;
  const glidePercent = (gridY % 1 - 0.5) * 2;
  const dir = Math.sign(glidePercent)
  //return dir * easeInCirc(glidePercent) * 0.5;

  const mappedGlide = map(Math.abs(glidePercent), 0.5, 1, 0, 1, true);
  return dir * mappedGlide * 0.5;
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