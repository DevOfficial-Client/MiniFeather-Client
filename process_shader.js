const fs = require('fs');
const filePath = 'c:/Users/etc/Desktop/MiniFeather-Client/src/CustomShader.js';
let code = fs.readFileSync(filePath, 'utf8');

// Step 1: Strip comments cleanly while respecting strings
function stripComments(input) {
    let inString = false;
    let stringChar = '';
    let inComment = 0; // 1 = line comment, 2 = block comment
    let result = '';

    for (let i = 0; i < input.length; i++) {
        let char = input[i];
        let next = input[i + 1];

        if (inComment === 0) {
            if (inString) {
                result += char;
                if (char === '\\') {
                    i++;
                    result += input[i];
                } else if (char === stringChar) {
                    inString = false;
                }
            } else {
                if (char === '\'' || char === '"' || char === '`') {
                    inString = true;
                    stringChar = char;
                    result += char;
                } else if (char === '/' && next === '/') {
                    inComment = 1;
                    i++;
                } else if (char === '/' && next === '*') {
                    inComment = 2;
                    i++;
                } else {
                    result += char;
                }
            }
        } else if (inComment === 1) {
            if (char === '\n' || char === '\r') {
                inComment = 0;
                result += char;
            }
        } else if (inComment === 2) {
            if (char === '*' && next === '/') {
                inComment = 0;
                i++;
            }
        }
    }
    return result;
}

code = stripComments(code);

// Step 2: Remove Black Hole references
// Remove uPhBH, uPhBHSize, uPhBHSpin from uniforms object
code = code.replace(/\s*uPhBH:\s*\{\s*value:\s*[\d\.]+\s*\},?/g, '');
code = code.replace(/\s*uPhBHSize:\s*\{\s*value:\s*[\d\.]+\s*\},?/g, '');
code = code.replace(/\s*uPhBHSpin:\s*\{\s*value:\s*[\d\.]+\s*\},?/g, '');

// Remove GLSL uniform declarations
code = code.replace(/\s*uniform float uPhBH;/g, '');
code = code.replace(/\s*uniform float uPhBHSize;/g, '');
code = code.replace(/\s*uniform float uPhBHSpin;/g, '');

// Remove mfBlackHoleDir GLSL function definition
code = code.replace(/\s*vec3 mfBlackHoleDir\([\s\S]*?\n\s*}/g, '');

// Remove mfBlackHoleDir call in postMain
code = code.replace(/\s*gl_FragColor\.rgb = mfBlackHoleDir\(gl_FragColor\.rgb, mfPhWorldPos, uPhCamPos\);/g, '');

// Remove EFFECT_DEFS entries
code = code.replace(/\s*phbh:\s*\{\s*key:\s*'uPhBH',\s*max:\s*1\s*\},?/g, '');
code = code.replace(/\s*phbhsize:\s*\{\s*key:\s*'uPhBHSize',\s*max:\s*1\s*\},?/g, '');
code = code.replace(/\s*phbhspin:\s*\{\s*key:\s*'uPhBHSpin',\s*max:\s*3\s*\},?/g, '');

// Step 3: Clean up whitespace / empty lines
// Remove lines that only contain whitespace, replacing multiple blank lines with max 1 blank line
let lines = code.split('\n');
let cleanedLines = [];
let blankCount = 0;

for (let line of lines) {
    let trimmed = line.trimEnd();
    if (trimmed.trim() === '') {
        blankCount++;
        if (blankCount <= 1) {
            cleanedLines.push('');
        }
    } else {
        blankCount = 0;
        cleanedLines.push(trimmed);
    }
}

let finalCode = cleanedLines.join('\n').trim() + '\n';

fs.writeFileSync(filePath, finalCode, 'utf8');
console.log('Successfully processed CustomShader.js!');
