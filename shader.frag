#extension GL_EXT_shader_non_constant_global_initializers : enable

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

uniform float u_stepsVisibility;
uniform float u_edoStepVisibility;
uniform float u_snapHeight;

uniform float u_playYarray[16];
uniform float u_playRedArray[16];
uniform float u_playBlueArray[16];
uniform float u_playGreenArray[16];
uniform int u_playYarrayLength;

uniform vec2 u_circlePos;
uniform float u_circleRadius;

uniform bool u_spiralMode;
uniform bool u_harmonicSeriesMode;

#define PI 3.14159265358979323844

float semiPixel = u_pixelHeight * 0.5;
vec2 octaveTileSize = vec2(u_columnWidth, u_octaveHeight);
vec2 edoTileSize = vec2(u_columnWidth, u_octaveHeight/float(u_edo));

// smoothing functions
float curveUpDown(float t) {
    float value = sin(t * PI);
    return (value + 1.0) * 0.5;
}

float glowDist(float edgeSharp, float edgeGlow, float blend, float x) {
    float insideObject = smoothstep(edgeSharp - semiPixel, edgeSharp + semiPixel, x);
    float glowEffect = smoothstep(edgeSharp + semiPixel, edgeSharp + semiPixel + edgeGlow, x);
    float finalEffect = mix(insideObject, glowEffect, blend); // Example blending
    return finalEffect;
}

// used for distance functions to also check the "next" repetition when using mod()
float minWrap(float val, float wrapRange) {
    return min(val, wrapRange - val);
}

// returns 1.0 if inside, has hard edge as well as soft glow
float fretMarker(float curveAmt, float y, float weight, float blend) {
    float sharpCurve = max(u_pixelHeight, curveAmt * u_octaveHeight * weight * 0.3); //u_pixelHeight
    float glowCurve = curveAmt * u_octaveHeight * weight * 1.2;
    return (1.0 - glowDist(sharpCurve, glowCurve, blend, abs(y))) * curveAmt;
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

float easeOutCirc(float x) {
    return sqrt(1.0 - pow(x - 1.0, 2.0));
}

// float easeOutQuart(float x) {
//     return 1.0 - pow(1.0 - x, 4.0);
// }

vec3 keyboardColumnColor(vec2 kbPos, vec2 columnPos) {
    // 0,0 is the left edge of the column, base note position.
    vec2 deltaPos = kbPos - columnPos;

    if (u_harmonicSeriesMode) {
        vec2 octOffset = 1. + (deltaPos / octaveTileSize);
        if (octOffset.x > 0. && octOffset.y > 0.) {deltaPos = log2(octOffset) * octaveTileSize;} else {return vec3(0.);}
    }

    vec2 octavePos = mod(deltaPos, octaveTileSize);
    vec2 edoPos = mod(deltaPos, edoTileSize);

    // start with black and add
    vec3 additiveColor = vec3(0.0);

    // margins stay empty
    float blankMarginWidth = u_pixelHeight * 1.5;
    if (deltaPos.x < blankMarginWidth || deltaPos.x > u_columnWidth - blankMarginWidth) {
        return vec3(0.1, 0.1, .1);
    }

    // from 0 to 1 to 0 along width, with semicircle height. 
    // slightly scale towards the center so the sides stay empty
    float columnCenterDistX = 1. - abs((deltaPos.x / u_columnWidth) - 0.5) * 2. * 1.1;
    float columnCenterDistCircX = easeOutCirc(columnCenterDistX);

    // lines in column

    // get nearest frets to the current y and their color and distance
    int fretIndexLower = -1; // this means the lowest color gets calculated
    float heightLower = 0.0;
    vec3 lowerColor = vec3(0.0);

    int fretIndexHigher = u_stepsYarrayLength;
    float heightHigher = u_octaveHeight;
    vec3 higherColor = vec3(u_stepsRedArray[0], u_stepsGreenArray[0], u_stepsBlueArray[0]); // has to be starting color because the last 

    for (int i = 0; i < 128; i++) {
        if (i == u_stepsYarrayLength) break;
        if (u_stepsYarray[i] < octavePos.y && i > fretIndexLower) {
            fretIndexLower = i;
            heightLower = u_stepsYarray[i];
            lowerColor = vec3(u_stepsRedArray[i], u_stepsGreenArray[i], u_stepsBlueArray[i]);
        }
        if (u_stepsYarray[i] > octavePos.y && i < fretIndexHigher) {
            fretIndexHigher = i;
            heightHigher = u_stepsYarray[i];
            higherColor = vec3(u_stepsRedArray[i], u_stepsGreenArray[i], u_stepsBlueArray[i]);
        }
    }

    float centerBetweenHeights = (heightLower + heightHigher) * 0.5;
    float heightLowerEdge = min(centerBetweenHeights, heightLower + u_snapHeight);
    float heightHigherEdge = max(centerBetweenHeights, heightHigher - u_snapHeight);

    if (octavePos.y < heightLowerEdge) {
        if (heightLower == 0.) lowerColor *= 2.; 
        float range = heightLowerEdge - heightLower;
        float upperNorm = (octavePos.y - heightLower) / range;
        if ((1.-columnCenterDistCircX) + upperNorm < 1.) {
            lowerColor *= min(1., (columnCenterDistCircX - upperNorm)*10.);
            float fretSDF = upperNorm * 4. + 1.-columnCenterDistCircX;
            if (fretSDF < 1.) { 
                additiveColor += lowerColor * u_stepsVisibility; 
            } else {
                additiveColor += lowerColor * (0.1 + 0.7 / fretSDF) * u_stepsVisibility; 
            }
        }
    } else if (octavePos.y > heightHigherEdge) {
        if (heightHigher == u_octaveHeight) higherColor *= 2.; 
        float range = heightHigher - heightHigherEdge;
        float lowerNorm = (heightHigher - octavePos.y) / range;
        if (- (1.-columnCenterDistCircX) + (1.-lowerNorm) > 0.) {
            higherColor *= min(1., (columnCenterDistCircX - lowerNorm)*10.);
            float fretSDF = lowerNorm * 4. + 1.-columnCenterDistCircX;
            if (fretSDF < 1.) { 
                additiveColor += higherColor * u_stepsVisibility; 
            } else {
                additiveColor += higherColor * (0.1 + 0.7 / fretSDF) * u_stepsVisibility; 
            }
        }
    }

    // edo
    // float edoFretWeight = 0.2 / float(u_edo);
    float nearestEdoFretY = minWrap(edoPos.y, edoTileSize.y);
    if (columnCenterDistCircX > 0.9 && nearestEdoFretY < 0.001) {
        additiveColor += vec3(u_edoStepVisibility);
    }

    // playing
    for (int i = 0; i < 10; i++) {
        if (i == u_playYarrayLength) break;
        float targetY = u_playYarray[i];

        float inRange = max(0., (1. - abs(deltaPos.y - targetY) * 20.)) * 0.3;
        float smallRange = max(0., (1. - abs(deltaPos.y - targetY) * 110.)) * 0.9;
        if (inRange < 1.) {
            vec3 color = vec3(u_playRedArray[i], u_playGreenArray[i], u_playBlueArray[i]);
            additiveColor = screenBlend(additiveColor, color * inRange);
            if (columnCenterDistCircX + smallRange > 1.0) additiveColor = screenBlend(additiveColor, color * smallRange);
        }
    }

    return additiveColor;
}

vec3 keyboardColor(vec2 normPos, vec2 centerPos) {
    vec2 deltaPos = normPos - centerPos;

    if (u_spiralMode) {
        deltaPos = normCartToNormPolar(vec2(-deltaPos.x, -deltaPos.y / (u_resolution.x / u_resolution.y)));
        deltaPos.x -= (deltaPos.y + 2.) * u_columnWidth;
        deltaPos.y *= u_columnOffsetY;
    }

    float columnIndex = floor(deltaPos.x / u_columnWidth);
    vec2 columnPos = vec2(columnIndex * u_columnWidth, columnIndex * -u_columnOffsetY);
    vec3 keyboardColumnColor = keyboardColumnColor(deltaPos, columnPos);

    return keyboardColumnColor;
}

vec3 circleColor(vec2 polarCoords) {

    vec3 additiveColor = vec3(0.0);
    vec3 lineColor = vec3(0.85, 0.8, 0.8);
    vec3 edoLineColor = vec3(0.2, 0.3, 0.3);

    polarCoords.y *= u_octaveHeight;

    // from 0 to 1 to 0 along width, with semicircle height. 
    // slightly scale towards the center so the sides stay empty
    float columnCenterDistX = 1. - abs((polarCoords.x) - 0.5) * 2. * 1.1;
    float columnCenterDistCircX = easeOutCirc(columnCenterDistX);

    float edoY = mod(polarCoords.y, edoTileSize.y);

    // lines in column
    float edoFretWeight = 0.2 / float(u_edo);
    float nearestEdoFretY = minWrap(edoY, edoTileSize.y);
    float edoFretContour = fretMarker(columnCenterDistCircX, nearestEdoFretY, edoFretWeight, 0.35);
    if (edoFretContour > 0.0) {
        additiveColor += edoLineColor * edoFretContour;
    }

    // scale
    float scaleFretWeight = 0.2 / float(u_stepsYarrayLength);
    for (int i = 0; i < 128; i++) {
        if (i == u_stepsYarrayLength) break;
        float deltaNearestY = minWrap(polarCoords.y - u_stepsYarray[i], u_octaveHeight);
        float scaleFretContour = fretMarker(columnCenterDistCircX, deltaNearestY, scaleFretWeight, 0.35);
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
        float playingMarkerContour = fretMarker(columnCenterDistCircX, nearestPlayingY, 0.04, 0.35);
        if (playingMarkerContour > 0.0) {
            additiveColor = screenBlend(additiveColor, lineColor * playingMarkerContour);
        }
    }

    return additiveColor;
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
        // mix black
        combinedColor = mix(combinedColor, vec3(0.0), circleAlpha);
        // add 
        vec3 visualsColor = circleColor(polarCoords);
        combinedColor += visualsColor * circleAlpha;
    }

    gl_FragColor = vec4(combinedColor, 1.0);
}