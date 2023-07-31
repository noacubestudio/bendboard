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

#define PI 3.14159265358979323844

float semiPixel = u_pixelHeight * 0.5;
vec2 octaveTileSize = vec2(u_columnWidth, u_octaveHeight);
vec2 edoTileSize = vec2(u_columnWidth, u_octaveHeight/float(u_edo));

// smoothing functions
float curveUpDown(float t) {
    float value = sin(t * PI);
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

vec2 normCartToNormPolar(vec2 cartesian) {
    float radius = length(cartesian);
    float angle = atan(cartesian.x, cartesian.y);
    float normAngle = (angle * 0.5 / PI + 0.5);
    return vec2(radius, normAngle);
}

vec3 keyboardColumnColor(vec2 kbPos, vec2 columnPos) {
    // 0,0 is the left edge of the column, base note position.
    vec2 deltaPos = kbPos - columnPos;

    vec2 octavePos = mod(deltaPos, octaveTileSize);
    vec2 edoPos = mod(deltaPos, edoTileSize);

    // decide color
    vec3 lineColor = vec3(0.8);
    vec3 edoLineColor = vec3(0.3);

    // start with black and add
    vec3 additiveColor = vec3(0.0);

    // margins stay empty
    float blankMarginWidth = u_pixelHeight * 1.5;
    if (deltaPos.x < blankMarginWidth || deltaPos.x > u_columnWidth - blankMarginWidth) {
        return additiveColor;
    }

    // scaled x in column
    float curvedX = curveUpDown(deltaPos.x / u_columnWidth);

    // lines in column
    float edoFretWeight = 0.2 / float(u_edo);
    float nearestEdoFretY = minWrap(edoPos.y, edoTileSize.y);
    float edoFretContour = fretMarker(curvedX, nearestEdoFretY, edoFretWeight);
    if (edoFretContour > 0.0) {
        additiveColor += edoLineColor * edoFretContour;
    }

    // scale
    float scaleFretWeight = 0.2 / float(u_stepsYarrayLength);
    for (int i = 0; i < 128; i++) {
        if (i == u_stepsYarrayLength) break;
        float deltaNearestY = minWrap(octavePos.y - u_stepsYarray[i], u_octaveHeight);
        float scaleFretContour = fretMarker(curvedX, deltaNearestY, scaleFretWeight);
        if (scaleFretContour > 0.0) {
            vec3 color = vec3(u_stepsRedArray[i], u_stepsGreenArray[i], u_stepsBlueArray[i]);
            additiveColor += color * scaleFretContour;
        }
    }

    // highlight the first scalestep (each octave) with another layer
    float nearestOctaveFretY = minWrap(octavePos.y, u_octaveHeight);
    float octaveFretContour = 1.0 - smoothstep(0.0, curvedX * u_octaveHeight * 0.08, abs(nearestOctaveFretY));
    if (octaveFretContour > 0.0) {
        vec3 color = vec3(u_stepsRedArray[0], u_stepsGreenArray[0], u_stepsBlueArray[0]);
        additiveColor += color * octaveFretContour * 0.4;
    }

    // playing
    for (int i = 0; i < 10; i++) {
        if (i == u_playYarrayLength) break;
        float targetY = u_playYarray[i];
        float playingMarkerContour = fretMarker(curvedX, deltaPos.y - targetY, 0.05);
        if (playingMarkerContour > 0.0) {
            additiveColor = screenBlend(additiveColor, lineColor * playingMarkerContour);
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

vec3 circleColor(vec2 polarCoords) {

    vec3 additiveColor = vec3(0.0);
    vec3 lineColor = vec3(0.8);
    vec3 edoLineColor = vec3(0.3);

    polarCoords.y *= u_octaveHeight;
    // scaled x in column
    float curvedX = curveUpDown(polarCoords.x);

    float edoY = mod(polarCoords.y, edoTileSize.y);

    // lines in column
    float edoFretWeight = 0.2 / float(u_edo);
    float nearestEdoFretY = minWrap(edoY, edoTileSize.y);
    float edoFretContour = fretMarker(curvedX, nearestEdoFretY, edoFretWeight);
    if (edoFretContour > 0.0) {
        additiveColor += edoLineColor * edoFretContour;
    }

    // scale
    float scaleFretWeight = 0.2 / float(u_stepsYarrayLength);
    for (int i = 0; i < 128; i++) {
        if (i == u_stepsYarrayLength) break;
        float deltaNearestY = minWrap(polarCoords.y - u_stepsYarray[i], u_octaveHeight);
        float scaleFretContour = fretMarker(curvedX, deltaNearestY, scaleFretWeight);
        if (scaleFretContour > 0.0) {
            vec3 color = vec3(u_stepsRedArray[i], u_stepsGreenArray[i], u_stepsBlueArray[i]);
            additiveColor += color * scaleFretContour;
        }
    }

    // playing
    for (int i = 0; i < 10; i++) {
        if (i == u_playYarrayLength) break;
        float inOctavePlayFret = mod(u_playYarray[i], u_octaveHeight);
        float nearestPlayingY = minWrap(polarCoords.y - inOctavePlayFret, u_octaveHeight);
        //float nearestPlayingAngle = nearestPlayingY / u_octaveHeight;
        float playingMarkerContour = fretMarker(curvedX, nearestPlayingY, 0.05);
        if (playingMarkerContour > 0.0) {
            additiveColor = screenBlend(additiveColor, lineColor * playingMarkerContour);
        }
    }

    return additiveColor;

    //return vec3(polarCoords.y);
}

void main() {
    
    // screen position normalized to 0-1 range
    vec2 normalizedPos = gl_FragCoord.xy/u_resolution.xy;

    // draw the keyboard and set colors for now
    vec2 keyboardCenterPos = u_basePosition;
    vec3 keyboardColor = keyboardColor(normalizedPos, keyboardCenterPos);

    vec3 combinedColor = keyboardColor;
    
    // octave circle in top left
    vec2 circleXYdist = u_circlePos - normalizedPos;
    circleXYdist.x *= (u_resolution.x / u_resolution.y);

    // polar coords, normalized to the circle radius
    vec2 normCircleDistCartesian = circleXYdist / u_circleRadius;
    vec2 polarCoords = normCartToNormPolar(normCircleDistCartesian);

    if (polarCoords.x < 1.0) {
        float circleAlpha = 1.0 - smoothstep(0.8, 1.0, polarCoords.x);
        // subtract
        combinedColor = max(combinedColor - vec3(circleAlpha), 0.0);
        // add 
        vec3 visualsColor = circleColor(polarCoords);
        combinedColor += visualsColor * circleAlpha;
    }

    gl_FragColor = vec4(combinedColor, 1.0);
}