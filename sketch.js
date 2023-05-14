let cnv;
const container = document.getElementById("canvas-container");

// sound settings
let lpFilter; let reverb;
let waveform = "sawtooth";
let baseFreq = 55;

let edo = 12;
let startStep = 9;
//let stepCents = (edo) => 1200/edo;

const xStep = 2;
const yStep = 1;
const edoStepStartX = 0;
const edoStepStartY = 0;

// keyboard
const colCount = 22;
const rowCount = 12;

const channels = [];
// initialed with 10 channels, 
// each contains an object with the synth 
// and source: [off, kbd, touch, mouse, ref]
// sources that are off will be filled again first before starting a new synth,
// skipping the first position reserved for the ref pitch

window.setup = () => {
  cnv = createCanvas(windowWidth-20, windowHeight-20).parent(container);
  
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

  const delay = new p5.Delay();
  delay.process(lpFilter, 0.18, .6, 2300);
  delay.setType(1);
  delay.drywet(0.7);

  noLoop();
  textFont('monospace');
  rectMode(CORNERS);
  strokeWeight(3);

  // initialize all channels
  for (let i = 0; i < 10; i++) {
    
    let source = "off";
    let synth = new p5.Oscillator();
    let sourceProperties = {};

    synth.disconnect();
    synth.connect(lpFilter);
    synth.setType(waveform);
    synth.freq(baseFreq)
    synth.amp(0.5);



    channels.push({synth: synth, source: source, sourceProperties: sourceProperties});
  }


}

window.windowResized = () => {
  resizeCanvas(windowWidth-20, windowHeight-20);
}

let playedSteps = []; // step keyboard via mouse/touch/kbd

function updatePlayed() {

  playedSteps = [];

  channels.forEach((channel, index)=>{
    if (channel.source !== "off") {
      const edostep = channel.sourceProperties.edostep;
      if (edostep !== undefined) {
        playedSteps.push(edostep);
      }
    }
  });

}

window.draw = () => {

  updatePlayed();

  background("black");
  textSize(18);
  textAlign(CENTER, CENTER)
  fill("white");

  drawEdoKeyboard();
}

function drawEdoKeyboard() {
  if (edo <= 1) return;

  const keyWidth = width / colCount;
  const keyHeight = height / rowCount;

  push();
  translate(0, height);

  for (let x = 0; x < colCount; x++) {
    noStroke();
    for (let y = 0; y < rowCount; y++) {

      const gridXYedoStep = (x + edoStepStartX) * xStep + (y + edoStepStartY) * yStep;
      const edoStepInOctave = (gridXYedoStep+startStep) % edo;

      // Create a linear gradient that goes from top to bottom
      let gradient = drawingContext.createLinearGradient(0, y * -keyHeight, 0, (y+1) * -keyHeight);

      // is this step currently playing?
      let playingStep = false;
      for (let p = 0; p < playedSteps.length; p++) {
        if (gridXYedoStep === playedSteps[p]) {
          playingStep = true; break;
        }
      }
      if (playingStep) {
        if ([0, 2, 4, 5, 7, 9, 11].includes(edoStepInOctave)) {
          gradient.addColorStop(0.0, 'white');
          gradient.addColorStop(0.25, 'cyan');
          gradient.addColorStop(0.5, 'white');
          gradient.addColorStop(0.75, 'cyan');
          gradient.addColorStop(1.0, 'white');
        } else {
          gradient.addColorStop(0.0, 'black');
          gradient.addColorStop(0.25, 'blue');
          gradient.addColorStop(0.5, 'black');
          gradient.addColorStop(0.75, 'blue');
          gradient.addColorStop(1.0, 'black');
        }
        fill("pink")
        drawingContext.fillStyle = gradient;
      } else {
        if ([0, 2, 4, 5, 7, 9, 11].includes(edoStepInOctave)) {fill("white")} 
        else {fill("black")}
      }
      rect(x * keyWidth, y * -keyHeight, (x+1) * keyWidth, (y+1) * -keyHeight);

      // text
      if ([0].includes(edoStepInOctave)) {
        fill("red")
      } else if ([2, 4, 5, 7, 9, 11].includes(edoStepInOctave)) {
        fill("black")
      } else {
        fill("white")
      }
      const label = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B", "B#"][edoStepInOctave]
      text(label, x * keyWidth + keyWidth*0.5, y * -keyHeight - keyHeight*0.5)
    }
    // draw stroke columns
    stroke("gray");
    noFill();
    rect(x * keyWidth, 0, (x+1) * keyWidth, -height);
  }

  pop();
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
      channel.sourceProperties = {};
      channel.synth.stop();
      if (countInputs() === 0) {
        channels.forEach((channel, index) => {
          if (index !== 0) {channel.sourceProperties = {}}
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
    channel.sourceProperties = {};
    channel.synth.stop();
    if (countInputs() === 0) {
      channels.forEach((channel, index) => {
        channel.sourceProperties = {}
        channel.source = "off";
        channel.synth.stop();
      });
    }
    
    window.draw();
  }
}

function handleMouseOver() {
  isMouse = true;
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
    channel.sourceProperties = {};
    channel.synth.stop();
    window.draw();
  }
  return false; // prevent any default behavior
}

function setFromScreenXY(channel, x, y, initType, id) {

  channel.sourceProperties.edostep = undefined;
  if (edo > 1) {
    const channelEDOStep = setEdoStepFromScreenXY(x, y);
    const glide = setGlideFromScreenY(y);
    channel.sourceProperties.edostep = channelEDOStep;
    const channelCents = ((channelEDOStep+glide)/edo)*1200;
    channel.sourceProperties.cents = channelCents;

    // set freq
    channel.synth.freq(frequency(baseFreq, channelCents));
    if (initType !== undefined) initChannel(channel, initType, id);
  }
}

function setFromKbd(channel, position) {
  if (edo > 1) {
    const channelEDOStep = position - 1;
    channel.sourceProperties.edostep = channelEDOStep;
    const channelCents = (channelEDOStep/edo)*1200;
    channel.sourceProperties.cents = channelCents;

    // set freq
    channel.synth.freq(frequency(baseFreq, channelCents));
  }
}

function setEdoStepFromScreenXY(x, y) {
  const gridX = (x/width)*colCount;
  const gridY = (1-y/height)*rowCount;
  const gridXYedoStep = (Math.floor(gridX) + edoStepStartX) * xStep + (Math.floor(gridY) + edoStepStartY) * yStep;

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
  if (type === "touch") channel.sourceProperties.id = id;
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
      if (channel.source === source && channel.sourceProperties.edostep === id -1) {
        return i;
      }
    }
  } else if (source === "touch") {
    for (let i = 0; i < channels.length; i++) {
      const channel = channels[i];
      if (channel.source === source && channel.sourceProperties.id === id) {
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
export function cents(a, b) {
  if (b === a) return 0;
  //if (b % a === 0) return 1200;
  return 1200 * Math.log2(b / a); //% 1200;
}

// frequency after going certain distance in cents
export function frequency(base, cents) {
  return base * Math.pow(2, cents / 1200);
}

function easeInCirc(x) {
  return 1 - Math.sqrt(1 - Math.pow(x, 2));
  
  }