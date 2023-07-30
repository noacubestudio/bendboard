precision highp float;

uniform vec2 u_resolution;
uniform vec2 u_basePosition;
uniform float u_pixelHeight;

uniform float u_columnWidth;
uniform float u_columnOffsetY;

uniform float u_octaveHeight;
uniform int u_edo;

uniform float u_stepsYarray[128];
uniform float u_stepsRedArray[128];
uniform float u_stepsBlueArray[128];
uniform float u_stepsGreenArray[128];
uniform int u_stepsYarrayLength;

uniform float u_playYarray[10];
uniform int u_playYarrayLength;

uniform vec2 u_circlePos;
uniform float u_circleRadius;

float semiPixel = u_pixelHeight * 0.5;

// smoothing functions
float curveUpDown(float t) {
    float value = sin(t * 3.14159265358979323846);
    return (value + 1.0) * 0.5;
}

float glowDist(float edgeSharp, float edgeGlow, float x) {
    float insideObject = smoothstep(edgeSharp - semiPixel, edgeSharp + semiPixel, x);
    float glowEffect = smoothstep(edgeSharp + semiPixel, edgeSharp + semiPixel + edgeGlow, x);
    float finalEffect = mix(insideObject, glowEffect, 0.4); // Example blending
    return finalEffect;
}

// used for distance functions to also check the "next" repetition when using mod()
float minWrap(float val, float wrapRange) {
    return min(val, wrapRange - val);
}

// returns 1.0 if inside, has hard edge as well as soft glow
float fretMarker(float curveAmt, float y, float weight) {
    float sharpCurve = max(u_pixelHeight, curveAmt * u_octaveHeight * weight * 0.3); //u_pixelHeight
    float glowCurve = curveAmt * u_octaveHeight * weight * 1.2;
    return (1.0 - glowDist(sharpCurve, glowCurve, abs(y))) * curveAmt;
}

vec3 screenBlend(vec3 baseColor, vec3 blendColor) {
    vec3 result = 1.0 - (1.0 - baseColor) * (1.0 - blendColor);
    return result;
}

// vec2 toPolar(vec2 cartesian) {
// 	float distance = dist(cartesian);
// 	float angle = atan(cartesian.y, cartesian.x);
// 	return vec2(angle / (3.14159265358979323846/2.0), distance);
// }

vec3 keyboardColumnColor(vec2 kbPos, vec2 columnPos) {
    // 0,0 is the left edge of the column, base note position.
    vec2 deltaPos = kbPos - columnPos;

    // repeating per octave and per edo step
    vec2 octaveTileSize = vec2(u_columnWidth, u_octaveHeight);
    vec2 edoTileSize = vec2(u_columnWidth, u_octaveHeight/float(u_edo));

    vec2 octavePos = mod(deltaPos, octaveTileSize);
    vec2 edoPos = mod(deltaPos, edoTileSize);

    // decide color
    vec3 lineColor = vec3(0.8);
    vec3 edoLineColor = vec3(0.3);
    vec3 clearColor = vec3(0.0);

    vec3 additiveColor = clearColor;

    // margins stay empty
    float blankMarginWidth = u_pixelHeight * 1.5;
    if (deltaPos.x < blankMarginWidth || deltaPos.x > u_columnWidth - blankMarginWidth) {
        return clearColor;
    }

    // scaled x in column
    float curvedX = curveUpDown(deltaPos.x / u_columnWidth);

    // scale
    float scaleFretWeight = 0.2 / float(u_stepsYarrayLength);
    for (int i = 0; i < 128; i++) {
        if (i == u_stepsYarrayLength) break;
        float deltaNearestY = minWrap(octavePos.y - u_stepsYarray[i], u_octaveHeight);
        float scaleFretContour = fretMarker(curvedX, deltaNearestY, scaleFretWeight);
        if (scaleFretContour > 0.0) {
            vec3 color = vec3(u_stepsRedArray[i], u_stepsGreenArray[i], u_stepsBlueArray[i]);
            additiveColor += mix(clearColor, color, scaleFretContour);
        }
    }

    // lines in column
    float edoFretWeight = 0.2 / float(u_edo);
    float nearestEdoFretY = minWrap(edoPos.y, edoTileSize.y);
    float edoFretContour = fretMarker(curvedX, nearestEdoFretY, edoFretWeight);
    if (edoFretContour > 0.0) {
        additiveColor += mix(clearColor, edoLineColor, edoFretContour);
    }

    // highlight the first scalestep (each octave) with another layer
    float nearestOctaveFretY = minWrap(octavePos.y, u_octaveHeight);
    float octaveFretContour = 1.0 - smoothstep(0.0, curvedX * u_octaveHeight * 0.08, abs(nearestOctaveFretY));
    if (octaveFretContour > 0.0) {
        vec3 color = vec3(u_stepsRedArray[0], u_stepsGreenArray[0], u_stepsBlueArray[0]);
        additiveColor += mix(clearColor, color, octaveFretContour * 0.4);
    }

    // playing
    for (int i = 0; i < 10; i++) {
        if (i == u_playYarrayLength) break;
        float targetY = u_playYarray[i];
        float playingMarkerContour = fretMarker(curvedX, deltaPos.y - targetY, 0.05);
        if (playingMarkerContour > 0.0) {
            vec3 screenColor = mix(clearColor, lineColor, playingMarkerContour);
            additiveColor = screenBlend(additiveColor, screenColor);
        }
    }

    return additiveColor;
}

vec3 keyboardColor(vec2 normPos, vec2 centerPos) {
    vec2 deltaPos = normPos - centerPos;

    float columnIndex = floor(deltaPos.x / u_columnWidth);
    vec2 columnPos = vec2(columnIndex * u_columnWidth, columnIndex * -u_columnOffsetY);
    vec3 keyboardColumnColor = keyboardColumnColor(deltaPos, columnPos);

    return keyboardColumnColor;
}

void main() {
    
    // screen position normalized to 0-1 range
    vec2 normalizedPos = gl_FragCoord.xy/u_resolution.xy;

    vec2 keyboardCenterPos = u_basePosition;
    vec3 keyboardColor = keyboardColor(normalizedPos, keyboardCenterPos);

    gl_FragColor = vec4(keyboardColor, 1.0);

    // darken area in top left where the circle goes
    // WIP, actual visual currently still done in p5 portion
    float dx = abs(u_circlePos.x - normalizedPos.x) * (u_resolution.x / u_resolution.y);
    float dy = abs(u_circlePos.y - normalizedPos.y);
    if (length(vec2(dx, dy)) < u_circleRadius*1.1) {
        float inEdge = (1.0 - smoothstep(u_circleRadius*0.6, u_circleRadius*1.1, length(vec2(dx, dy))));
        gl_FragColor *= 1.0-1.2*vec4(vec3(inEdge*1.0), 1.0);
        //vec2 polarCoords = toPolar(vec2(dx, dy));
        //gl_FragColor += vec4(polarCoords.x * 0.8, polarCoords.x * 0.6, polarCoords.x * 1.0, 1.0);
    }
}