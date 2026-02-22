const msdfFragment = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
in vec4 v_color;
uniform sampler2D u_texture;
uniform float u_pxRange;
out vec4 outColor;

float median(float r, float g, float b) {
    return max(min(r, g), min(max(r, g), b));
}

void main() {
    vec3 msd = texture(u_texture, v_texCoord).rgb;
    float sd = median(msd.r, msd.g, msd.b);
    float screenPxDistance = u_pxRange * (sd - 0.5);
    float alpha = clamp(screenPxDistance + 0.5, 0.0, 1.0);
    outColor = vec4(v_color.rgb, v_color.a * alpha);
}
`;

const msdfVertex = `#version 300 es
in vec2 a_position;
in vec2 a_texCoord;
in vec4 a_color;
uniform vec2 uOffset;
uniform mat4 uProjection;
out vec2 v_texCoord;
out vec4 v_color;

void main() {
    gl_Position = uProjection * vec4(a_position + uOffset, 0.0, 1.0);
    v_texCoord = a_texCoord;
    v_color = a_color;
}
`;

const rectangleFragment = `#version 300 es
precision mediump float;

in vec2 vUV;
out vec4 outColor;

uniform vec4 uRect[128];     // xy = pos, zw = size
uniform int  uRectCount;
uniform vec2 uViewport;
uniform vec4 uColor;
uniform float uRadius;
uniform float uFeather;
uniform mat4 uProjection;

float sdRoundRect(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + vec2(r);
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float smin(float a, float b, float k) {
    float h = max(k - abs(a - b), 0.0) / k;
    return min(a, b) - h*h*k*0.25;
}

void main() {
    // Convert vUV from normalized [0,1] to screen coordinates using uProjection
    // First, get clip space position
    vec4 clip = uProjection * vec4(vUV, 0.0, 1.0);
    // Then, convert to screen space
    vec2 frag = clip.xy / clip.w;

    float dist = 1e20;
    for (int i = 0; i < uRectCount; i++) {
        vec2 pos  = uRect[i].xy;
        vec2 size = uRect[i].zw;

        vec2 p = frag - (pos + size * 0.5);
        float d = sdRoundRect(p, size * 0.5, uRadius);

        dist = (i == 0) ? d : smin(dist, d, uRadius);
    }

    float alpha = 1.0 - smoothstep(0.0, uFeather, dist);
    outColor = vec4(uColor.rgb, uColor.a * alpha);
}`;

const rectangleVertex = `#version 300 es
precision mediump float;
in vec2 aPos;
out vec2 vUV;

uniform vec2 uOffset;
uniform mat4 uProjection;
// uniform vec2 uViewport;

void main() {
    vUV = aPos;

    // vec2 pos = aPos;
    // pos += uOffset / uViewport;

    // // Fix horizontal flip: invert x
    // pos.y = 1.0 - pos.y;

    gl_Position = uProjection * vec4(aPos, 0.0, 1.0);
}`;

function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

function createProgram(gl, vertexSource, fragmentSource) {
    const program = gl.createProgram();
    gl.attachShader(program, createShader(gl, gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, createShader(gl, gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error(gl.getProgramInfoLog(program));
        return null;
    }
    return program;
}

function ortho(out, left, right, bottom, top, near, far) {
    out[0] = 2 / (right - left);
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = 2 / (top - bottom);
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[10] = -2 / (far - near);
    out[11] = 0;
    out[12] = -(right + left) / (right - left);
    out[13] = -(top + bottom) / (top - bottom);
    out[14] = -(far + near) / (far - near);
    out[15] = 1;
    return out;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8");

const asciiArtCharacterCodes = textEncoder.encode(" .-~:*=%@#");

class Font {
    constructor(gl, fontJson) {}
}

/**
 * A high-performance text grid renderer using WebGL and MSDF fonts.
 * Can entirely avoid JS string operations and use direct buffers/charcodes, and offers virtual scrolling to avoid re-rendering.
 */
class AcceleratedTextGridRenderer {
    /**
     * Creates a new accelerated text grid renderer.
     * @param {*} options 
     * @param {any} options.backgroundColor - Background color for the canvas. Can be an instance of LS.Color or any supported color format (hex, rgb, hsl, array, named color, color integer, object, etc.)
     * @param {number} options.fontSize - Base font size in pixels. Default is 16.
     * @param {number} options.limitFPS - Limits the rendering loop to the specified frames per second. Default is unlimited. Set to -1 to disable frame limiting.
     * @param {boolean} options.virtualScrolling - Enables or disables virtual scrolling. When enabled, the grid will render extra rows and columns beyond the viewport to allow smooth scrolling without re-rendering.
     * @param {number} options.virtualScrollBuffer - The number of extra rows and columns to render on each side of the viewport when virtual scrolling is enabled. Default is 32.
     * @param {function} options.onVirtualScroll - Optional callback function that is called whenever a virtual scroll occurs. Receives the new scrollX and scrollY values as parameters.
     * @param {number} options.scrollX - Initial horizontal scroll offset in pixels. Only applicable if virtual scrolling is enabled.
     * @param {number} options.scrollY - Initial vertical scroll offset in pixels. Only applicable if virtual scrolling is enabled.
     * @param {string} options.fontSrc - URL to the font JSON file. The corresponding PNG file should be in the same location with the same name but .png extension. Default is '/assets/fonts/JBMono.json'.
     * @param {number} options.zoom - Initial zoom level for the text grid. Default is 1 (no zoom).
     * @param {string} options.welcomeMsg - Custom welcome message to display on the welcome screen.
     */
    constructor(options = {}) {
        this.container = LS.Create({ class: "ls-textgrid-container" });

        this.frameScheduler = new LS.Util.FrameScheduler(this.#render.bind(this));

        this.font = null;
        this.indexCount = 0;
        this.gridDirty = false;

        this.fontSize = 16;
        this.scale = 1;
        this.cellWidth = 0;
        this.cellHeight = 0;

        this.gridOffsetX = 0;
        this.gridOffsetY = 0;

        this.virtualScrolling = false;
        this.virtualScrollBuffer = 32;
        this.scrollX = 0;
        this.scrollY = 0;
        this.virtualCol = 0;
        this.virtualRow = 0;

        this.projMatrix = new Float32Array(16);

        this.rectData = new Float32Array(128 * 4); // Max 128 rectangles, each defined by 4 floats (x, y, width, height)
        this.textSelection = [
            { row: 0, start: 0, len: 20 },
            { row: 1, start: 5, len: 10 }
        ]

        this.pendingResize = [false, 0, 0]; // [needsResize, width, height]

        // -- Welcome screen state
        this.welcomeMsg = ["Welcome to the LS terminal!"];
        this.startTime = 0;

        this.backgroundColor = new LS.Color(15, 14, 16);

        this.setOptions(options);
        if (options.init !== false) {
            this.init(options);
        }
    }

    setOptions(newOptions) {
        if (newOptions.backgroundColor) {
            this.backgroundColor = newOptions.backgroundColor instanceof LS.Color ? newOptions.backgroundColor : new LS.Color(newOptions.backgroundColor);
            if (this.gl) {
                this.gl.clearColor(...this.backgroundColor.floatPixel);
            }
        }

        if (newOptions.fontSize) {
            this.setFontSize(newOptions.fontSize);
        }

        if (newOptions.welcomeMsg) {
            this.welcomeMsg = newOptions.welcomeMsg.split('\n');;
        }

        if (newOptions.limitFPS) {
            this.frameScheduler.limitFPS(newOptions.limitFPS);
        }

        if(newOptions.virtualScrolling !== undefined) {
            this.virtualScrolling = newOptions.virtualScrolling;
            this.resize(); // Recalculate grid size based on new virtual scrolling setting
        }

        if(newOptions.virtualScrollBuffer !== undefined) {
            this.virtualScrollBuffer = newOptions.virtualScrollBuffer;
            this.resize(); // Recalculate grid size based on new virtual scrolling setting
        }

        if(newOptions.scrollX !== undefined && newOptions.scrollY !== undefined) {
            this.scrollX = newOptions.scrollX;
            this.scrollY = newOptions.scrollY;
            this.setOffset(-this.scrollX, -this.scrollY);
        }

        if(newOptions.onVirtualScroll) {
            this.onVirtualScroll = newOptions.onVirtualScroll;
        }

        if (newOptions.fontSrc && this.gl) {
            this.loadFont(newOptions.fontSrc);
        }
    }

    render() {
        if (!this.initialized) return;
        this.frameScheduler.schedule();
    }

    /**
     * Default sample welcome screen with an animated background and a centered message box.
     */
    welcome() {
        this.frameFunction = this.renderWelcomeFrame.bind(this);
        this.startTime = performance.now();
        this.frameScheduler.start();
    }

    renderWelcomeFrame() {
        if(!this.initialized || !this.cols || !this.rows) return;
        const t = (performance.now() - this.startTime) * 0.001;

        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
                const x = col * 0.07;
                const y = row * 0.09;

                let v = 0;
                v += Math.sin(x * 1.0 + y * 0.4 + t * 1.3);
                v += Math.sin(x * 0.6 - y * 0.8 + t * 0.9 + 1.7);
                v += Math.cos(x * 0.3 + y * 1.1 + t * 0.7 + 4.2) * 0.6;

                v += Math.sin(t * 0.4 + col * 0.13 + row * 0.17) * 0.25;

                const value = (v + 2.2) / 4.4;

                const charIdx = Math.floor(value ** 1.3 * (asciiArtCharacterCodes.length - 1)); // ^1.3 = more contrast
                const char = asciiArtCharacterCodes[charIdx];

                const brightness = value * 0.7 + 0.3;
                this._updateVertex(col, row, char,
                    0.6 + brightness * 0.4,
                    0.1 + brightness * 0.6,
                    0.5 + brightness * 0.4,
                    0.5
                );
            }
        }

        const lines = this.welcomeMsg;

        const boxWidth = lines.reduce((max, line) => Math.max(max, line.length), 0) + 6;
        const boxHeight = 5 + lines.length - 1;
        const startCol = Math.floor((this.cols - boxWidth) / 2);
        const startRow = Math.floor((this.rows - boxHeight) / 2);

        for (let r = 0; r < boxHeight; r++) {
            for (let c = 0; c < boxWidth; c++) {
                const col = startCol + c;
                const row = startRow + r;
                let char = 32; // space
                if (r === 0 && c === 0) char = 43; // +
                else if (r === 0 && c === boxWidth - 1) char = 43;
                else if (r === boxHeight - 1 && c === 0) char = 43;
                else if (r === boxHeight - 1 && c === boxWidth - 1) char = 43;
                else if (r === 0 || r === boxHeight - 1) char = 45; // -
                else if (c === 0 || c === boxWidth - 1) char = 124; // |

                this._updateVertex(col, row, char, 0.8, 0.9, 1.0, 1.0);
            }
        }

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const padding = ' '.repeat(Math.max(0, Math.floor((boxWidth - 4 - line.length) / 2)));
            this.writeText(padding + line + padding, startCol + 2, startRow + 2 + i, 0.9, 0.95, 1.0, 1.0);
        }
    }

    setFontSize(size) {
        this.fontSize = size;
        if (this.font) {
            this.scale = size / this.font.info.size;
            this.cellWidth = this.font.baseCellWidth * this.scale;
            this.cellHeight = this.font.baseCellHeight * this.scale;
            this._rebuildGlyphScale();

            // Rebuild all vertices with the new scale
            if (this.gridBuffer) {
                for (let row = 0; row < this.rows; row++) {
                    for (let col = 0; col < this.cols; col++) {
                        this._updateVertex(col, row);
                    }
                }
            }
        }
    }

    setupGrid(cols, rows) {
        this.cols = cols;
        this.rows = rows;

        const numCells = cols * rows;

        // Backing buffers to remember grid state for resizing
        this.gridBuffer = new Uint8ClampedArray(numCells * 5); // char code + 4 color components; big limitation is that only ASCII is covered
        this.gridBuffer.fill(255); // 1.0 in 0-255 range (20 down to 5 bytes compared to floats)

        // Fill charcodes to 0 (space) by default
        for(let i = 0; i < numCells; i++) {
            this.gridBuffer[i * 5] = 0;
        }

        // 4 vertices per cell, 8 floats per vertex (x, y, u, v, r, g, b, a)
        this.vertexData = new Float32Array(numCells * 4 * 8);
        this.indexData = new Uint32Array(numCells * 6);

        let iIdx = 0;
        let vertexOffset = 0;

        for (let i = 0; i < numCells; i++) {
            this.indexData[iIdx++] = vertexOffset + 0;
            this.indexData[iIdx++] = vertexOffset + 1;
            this.indexData[iIdx++] = vertexOffset + 2;
            this.indexData[iIdx++] = vertexOffset + 0;
            this.indexData[iIdx++] = vertexOffset + 2;
            this.indexData[iIdx++] = vertexOffset + 3;
            vertexOffset += 4;
        }

        const gl = this.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this.vertexData, gl.DYNAMIC_DRAW);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.indexData, gl.STATIC_DRAW);

        this.indexCount = this.indexData.length;
        this.gridDirty = false;
    }

    clearGrid() {
        if (!this.vertexData) return;
        this.gridBuffer.fill(0);
        this.vertexData.fill(0);
        this.gridDirty = true;
    }

    setChar(col, row, charCode, r = 1, g = 1, b = 1, a = 1) {
        if (col < 0 || col >= this.cols || row < 0 || row >= this.rows || !this.font) return;
        this._updateVertex(col, row, charCode, r, g, b, a);
    }

    /**
     * Updates the vertex data for a single cell in the grid.
     * @param {number} col - Column of the cell to update
     * @param {number} row - Row of the cell to update
     * @param {number} charCode - Optional new character code for the cell. If undefined, the character will not be changed.
     * @param {number} r - Optional new red color component (0-1). If undefined, the red component will not be changed.
     * @param {number} g - Optional new green color component (0-1). If undefined, the green component will not be changed.
     * @param {number} b - Optional new blue color component (0-1). If undefined, the blue component will not be changed.
     * @param {number} a - Optional new alpha component (0-1). If undefined, the alpha component will not be changed.
     */
    _updateVertex(col, row, charCode, r, g, b, a) {
        const cellIdx = (row * this.cols + col);

        // Dirty glyph (for now we only care to render if glyph changes through this function)
        let updateChar = false;//, updateColor = false;

        const bufferIdx = cellIdx * 5;
        if(charCode !== undefined) {
            updateChar = this.gridBuffer[bufferIdx] !== charCode;
            this.gridBuffer[bufferIdx] = charCode;
        } else if(r === undefined && g === undefined && b === undefined && a === undefined) {
            return; // No updates needed
        }

        // Set & readback (we need to do that to ensure the value is rounded to Float32 precision)
        if(r !== undefined) this.gridBuffer[bufferIdx + 1] = r * 255; r = this.gridBuffer[bufferIdx + 1] / 255;
        if(g !== undefined) this.gridBuffer[bufferIdx + 2] = g * 255; g = this.gridBuffer[bufferIdx + 2] / 255;
        if(b !== undefined) this.gridBuffer[bufferIdx + 3] = b * 255; b = this.gridBuffer[bufferIdx + 3] / 255;
        if(a !== undefined) this.gridBuffer[bufferIdx + 4] = a * 255; a = this.gridBuffer[bufferIdx + 4] / 255;

        const v = this.vertexData;
        const vIdx = cellIdx * 32; // 4 verts * 8 floats

        this.gridDirty = true;

        // It would be more readable to use inline enums but JS doesn't have that
        // Maybe one day I'll rewrite this in Glitter 🤔

        // Set cell color
        // TODO: Use Uint8 rather than 16 floats per cell
        v[vIdx +  4] = r;
        v[vIdx +  5] = g;
        v[vIdx +  6] = b;
        v[vIdx +  7] = a;
        v[vIdx + 12] = r;
        v[vIdx + 13] = g;
        v[vIdx + 14] = b;
        v[vIdx + 15] = a;
        v[vIdx + 20] = r;
        v[vIdx + 21] = g;
        v[vIdx + 22] = b;
        v[vIdx + 23] = a;
        v[vIdx + 28] = r;
        v[vIdx + 29] = g;
        v[vIdx + 30] = b;
        v[vIdx + 31] = a;

        if(!updateChar) return;

        if(charCode < this.font._lowestCharCode) charCode = this.font._missingGlyphIndex;
        else charCode = ((charCode - this.font._lowestCharCode) * 15) || this.font._missingGlyphIndex;

        const map = this.cmap;
        const x = col * this.cellWidth;
        const y = row * this.cellHeight;
        const u0 = map[charCode + 7];
        const v0 = map[charCode + 8];
        const u1 = map[charCode + 9];
        const v1 = map[charCode + 10];
        const x0 = x  + map[charCode + 11];
        const y0 = y  + map[charCode + 12];
        const x1 = x0 + map[charCode + 13];
        const y1 = y0 + map[charCode + 14];

        // Top-Left
        v[vIdx    ] = x0;
        v[vIdx + 1] = y0;
        v[vIdx + 2] = u0;
        v[vIdx + 3] = v0;

        // Top-Right
        v[vIdx + 8] = x1;
        v[vIdx + 9] = y0;
        v[vIdx + 10] = u1;
        v[vIdx + 11] = v0;

        // Bottom-Right
        v[vIdx + 16] = x1;
        v[vIdx + 17] = y1;
        v[vIdx + 18] = u1;
        v[vIdx + 19] = v1;

        // Bottom-Left
        v[vIdx + 24] = x0;
        v[vIdx + 25] = y1;
        v[vIdx + 26] = u0;
        v[vIdx + 27] = v1;
    }

    #render() {
        if(this.pendingResize[0]) {
            this.#resize(this.pendingResize[1], this.pendingResize[2]);
            this.pendingResize[0] = false;
        }

        if (this.frameFunction) {
            this.frameFunction();
        }

        const cw = this.canvas.width;
        const ch = this.canvas.height;

        const gl = this.gl;
        gl.viewport(0, 0, cw, ch);
        gl.clear(gl.COLOR_BUFFER_BIT);

        if (!this.font || this.indexCount === 0) return;

        this.updateBuffers();

        const updatedDimensions = cw !== this.lastRenderWidth || ch !== this.lastRenderHeight;
        if (updatedDimensions) {
            this.lastRenderWidth = cw;
            this.lastRenderHeight = ch;
            ortho(this.projMatrix, 0, cw, ch, 0, -1, 1);
        }

        const locations = this.locations;

        // -- Render text selection from precomputed grid positions
        if(this.textSelection) {
            const MAX_RECTS = 128; // Must match the size of the uRect array in the shader
            const rectData = this.rectData;

            let count = 0;
            for (const sel of this.textSelection) {
                if (count >= MAX_RECTS) break;
                rectData[count * 4    ] = sel.start * this.cellWidth;
                rectData[count * 4 + 1] = sel.row * this.cellHeight;
                rectData[count * 4 + 2] = sel.len * this.cellWidth;
                rectData[count * 4 + 3] = this.cellHeight;
                count++;
            }

            gl.useProgram(this.rectProgram);
            gl.bindVertexArray(this.rectVao);

            gl.uniform2f(locations.rectOffset, this.gridOffsetX, this.gridOffsetY);
            gl.uniform1i(locations.rectCount, count);
            gl.uniform4fv(locations.rectArray, rectData);

            if(updatedDimensions) {
                gl.uniform2f(locations.rectViewport, cw, ch);
                gl.uniformMatrix4fv(locations.rectProjection, false, this.projMatrix);
                
                // Yes, these have nothing to do with dimensions, but I was lazy to make a separate flag, so it's close enough
                gl.uniform1f(locations.rectRadius, 2.5);
                gl.uniform1f(locations.rectFeather, 2.0);
                gl.uniform4f(locations.rectColor, 0.3, 0.5, 1.0, 0.5);
            }

            // Single draw
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }

        // -- Render text grid
        // Scale the MSDF pixel range to keep edges crisp at different font sizes
        gl.useProgram(this.program);
        if(updatedDimensions) {
            gl.uniformMatrix4fv(locations.projection, false, this.projMatrix);
        }
        gl.uniform2f(locations.offset, this.gridOffsetX, this.gridOffsetY);
        gl.uniform1f(locations.pxRange, 4.0 * this.scale);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.uniform1i(locations.texture, 0);
        gl.bindVertexArray(this.vao);
        gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_INT, 0);
        gl.bindVertexArray(null);
    }

    /**
     * Writes a string of text to the grid starting at the specified column and row. Respects newlines and wraps text that exceeds the grid width.
     * @param {string} text
     * @param {number} startCol 
     * @param {number} startRow 
     * @param {number} r 
     * @param {number} g 
     * @param {number} b 
     * @param {number} a
     */
    writeText(text, startCol = 0, startRow = 0, r = 1, g = 1, b = 1, a = 1) {
        let col = startCol;
        let row = startRow;
        for (let i = 0; i < text.length; i++) {
            if (text.charCodeAt(i) === 10) { // \n
                col = startCol;
                row++;
                continue;
            }

            this.setChar(col, row, text.charCodeAt(i), r, g, b, a);

            col++;

            if (col >= this.cols) {
                col = 0;
                row++;
            }
        }
        return this;
    }
    /**
     * Writes a string of text to the grid starting at the specified column and row. Respects newlines and wraps text that exceeds the grid width.
     * @param {Uint8Array} buffer - A buffer containing UTF-8 encoded text
     * @param {number} startCol 
     * @param {number} startRow 
     * @param {number} r 
     * @param {number} g 
     * @param {number} b 
     * @param {number} a
     */
    writeTextFromBuffer(buffer, startCol = 0, startRow = 0, r = 1, g = 1, b = 1, a = 1) {
        let col = startCol;
        let row = startRow;
        for (let i = 0; i < buffer.length; i++) {
            if (buffer[i] === 10) { // \n
                col = startCol;
                row++;
                continue;
            }

            this.setChar(col, row, buffer[i], r, g, b, a);

            col++;

            if (col >= this.cols) {
                col = 0;
                row++;
            }
        }
        return this;
    }

    updateBuffers() {
        if (!this.gridDirty) return;
        const gl = this.gl;

        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);

        // orphan old storage (avoids stall if GPU is still using it)
        gl.bufferData(gl.ARRAY_BUFFER, this.vertexData.byteLength, gl.DYNAMIC_DRAW);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.vertexData);

        this.gridDirty = false;
    }

    async loadFont(src) {
        const name = src.split('/').pop().split('.').shift();
        const imgUrl = `/assets/fonts/${name}.png`;

        const [fontData, image] = await Promise.all([
            fetch(src).then(r => r.json()),
            new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = reject;
                img.src = imgUrl;
            })
        ]);

        const gl = this.gl;
        this.texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        // Number of floats per character in the cmap
        const MAP_SLOTS = 15;

        const lowestCharCode = Math.min(...fontData.chars.map(c => c.char.charCodeAt(0)));
        const highestCharCode = Math.max(...fontData.chars.map(c => c.char.charCodeAt(0)));

        // Pack the font data into a single Float32Array for fast access
        const map = new Float32Array((highestCharCode - lowestCharCode + 1) * MAP_SLOTS); // +1 for missing glyph

        // Precompute as much as possible
        for (let i = 0; i < fontData.chars.length; i++) {
            const charData = fontData.chars[i];
            const code = charData.char.charCodeAt(0);

            /* x, y, w, h, xoffset, yoffset, xadvance, u0, v0, u1, v1, xOff, yOff, gw, gh */

            // Font atlas data
            map[(code - lowestCharCode) * MAP_SLOTS + 0] = charData.x;
            map[(code - lowestCharCode) * MAP_SLOTS + 1] = charData.y;
            map[(code - lowestCharCode) * MAP_SLOTS + 2] = charData.width;
            map[(code - lowestCharCode) * MAP_SLOTS + 3] = charData.height;
            map[(code - lowestCharCode) * MAP_SLOTS + 4] = charData.xoffset;
            map[(code - lowestCharCode) * MAP_SLOTS + 5] = charData.yoffset;
            map[(code - lowestCharCode) * MAP_SLOTS + 6] = charData.xadvance;

            // UV coordinates
            map[(code - lowestCharCode) * MAP_SLOTS + 7] = charData.x / image.width;
            map[(code - lowestCharCode) * MAP_SLOTS + 8] = charData.y / image.height;
            map[(code - lowestCharCode) * MAP_SLOTS + 9] = (charData.x + charData.width) / image.width;
            map[(code - lowestCharCode) * MAP_SLOTS + 10] = (charData.y + charData.height) / image.height;

            // Scale based
            map[(code - lowestCharCode) * MAP_SLOTS + 11] = (charData.xoffset || 0) * this.scale;
            map[(code - lowestCharCode) * MAP_SLOTS + 12] = (charData.yoffset || 0) * this.scale;
            map[(code - lowestCharCode) * MAP_SLOTS + 13] = charData.width * this.scale;
            map[(code - lowestCharCode) * MAP_SLOTS + 14] = charData.height * this.scale;
        }

        // Font metrics
        const spaceCharData = fontData.chars.find(c => c.id === 32) || fontData.chars.find(c => c.id === 77) || fontData.chars[0];
        const baseCellWidth = spaceCharData.xadvance || 20;
        const baseCellHeight = fontData.info.size || 24;

        this.cmap = map;
        this.font = {
            name,
            atlasWidth: image.width,
            atlasHeight: image.height,
            // data: fontData, // This can be likely discarded
            info: fontData.info,
            baseCellWidth,
            baseCellHeight,
            _missingGlyphIndex: (highestCharCode - lowestCharCode + 1) * MAP_SLOTS,
            _lowestCharCode: lowestCharCode,
            _scale: this.scale
        };
    }

    _rebuildGlyphScale() {
        if (!this.font) return;
        for (let charCode = this.font._lowestCharCode; charCode < this.font._lowestCharCode + this.cmap.length / 15; charCode++) {
            const glyphIdx = (charCode - this.font._lowestCharCode) * 15;
            this.cmap[glyphIdx + 11] = (this.cmap[glyphIdx + 4] || 0) * this.scale; // xOff
            this.cmap[glyphIdx + 12] = (this.cmap[glyphIdx + 5] || 0) * this.scale; // yOff
            this.cmap[glyphIdx + 13] = this.cmap[glyphIdx + 2] * this.scale; // gw
            this.cmap[glyphIdx + 14] = this.cmap[glyphIdx + 3] * this.scale; // gh
        }
    }

    async init(options = {}) {
        if(this.initialized) return;
        this.initialized = true;

        this.canvas = document.createElement('canvas');
        this.canvas.width = 800;
        this.canvas.height = 600;
        this.container.appendChild(this.canvas);

        this.gl = this.canvas.getContext('webgl2');
        const gl = this.gl;

        gl.clearColor(...this.backgroundColor.floatPixel);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        this.canvas.addEventListener("wheel", (e) => {
            if (!this.virtualScrolling) return;
            e.preventDefault();
            this.scroll(e.deltaX, e.deltaY);
        });

        this.program = createProgram(gl, msdfVertex, msdfFragment);
        this.rectProgram = createProgram(gl, rectangleVertex, rectangleFragment);

        this.locations = {
            // -- Text rendering program locations
            position: gl.getAttribLocation(this.program, "a_position"),
            texCoord: gl.getAttribLocation(this.program, "a_texCoord"),
            color: gl.getAttribLocation(this.program, "a_color"),
            projection: gl.getUniformLocation(this.program, "uProjection"),
            texture: gl.getUniformLocation(this.program, "u_texture"),
            pxRange: gl.getUniformLocation(this.program, "u_pxRange"),
            offset: gl.getUniformLocation(this.program, "uOffset"),

            // -- Rectangle program locations
            rectColor: gl.getUniformLocation(this.rectProgram, "uColor"),
            rectRadius: gl.getUniformLocation(this.rectProgram, "uRadius"),
            rectFeather: gl.getUniformLocation(this.rectProgram, "uFeather"),
            rectArray: gl.getUniformLocation(this.rectProgram, "uRect"),
            rectCount: gl.getUniformLocation(this.rectProgram, "uRectCount"),
            rectViewport: gl.getUniformLocation(this.rectProgram, "uViewport"),
            rectProjection: gl.getUniformLocation(this.rectProgram, "uProjection"),
            rectOffset: gl.getUniformLocation(this.rectProgram, "uOffset")
        };

        // -- Setup text rendering program
        {
            this.vao = gl.createVertexArray();
            gl.bindVertexArray(this.vao);

            this.vertexBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);

            // Stride is 32 bytes (8 floats * 4 bytes)
            gl.enableVertexAttribArray(this.locations.position);
            gl.vertexAttribPointer(this.locations.position, 2, gl.FLOAT, false, 32, 0);

            gl.enableVertexAttribArray(this.locations.texCoord);
            gl.vertexAttribPointer(this.locations.texCoord, 2, gl.FLOAT, false, 32, 8);

            gl.enableVertexAttribArray(this.locations.color);
            gl.vertexAttribPointer(this.locations.color, 4, gl.FLOAT, false, 32, 16);

            this.indexBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);

            gl.bindVertexArray(null);

            await this.loadFont(options.fontSrc || '/assets/fonts/JBMono.json');

            this.setFontSize(this.fontSize);
            this.setupGrid(this.canvas.width / this.cellWidth, this.canvas.height / this.cellHeight);
        }

        // -- Setup rectangle program
        {
            // const quadVerts = new Float32Array([
            //     0,0, 1,0, 0,1, 1,1
            // ]);

            const quadVBO = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, quadVBO);
            // gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);

            this.rectVao = gl.createVertexArray();
            gl.bindVertexArray(this.rectVao);

            const aPosLoc = gl.getAttribLocation(this.rectProgram, "aPos");
            gl.enableVertexAttribArray(aPosLoc);
            gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0);

            gl.bindVertexArray(null);
        }
    }

    setOffset(x, y) {
        this.gridOffsetX = Number.isNaN(x) ? 0 : x;
        this.gridOffsetY = Number.isNaN(y) ? 0 : y;
        this.render();
    }

    #resize(width, height) {
        if(width !== undefined) this.canvas.width = width;
        if(height !== undefined) this.canvas.height = height;

        // this.setFontSize(this.fontSize); // Recalculate cell size and vertex positions

        if (this.virtualScrolling) {
            this.setupGrid(Math.ceil(this.canvas.width / this.cellWidth) + this.virtualScrollBuffer, Math.ceil(this.canvas.height / this.cellHeight) + this.virtualScrollBuffer);
        } else {
            this.setupGrid(Math.ceil(this.canvas.width / this.cellWidth), Math.ceil(this.canvas.height / this.cellHeight));
        }
    }

    resize(width, height) {
        if (!this.initialized) return;
        this.pendingResize[0] = true;
        this.pendingResize[1] = width;
        this.pendingResize[2] = height;
    }

    scroll(deltaX, deltaY) {
        this.scrollX = Math.max(0, this.scrollX + deltaX);
        this.scrollY = Math.max(0, this.scrollY + deltaY);

        const bufferWidth = Math.max(1, this.virtualScrollBuffer) * this.cellWidth;
        const bufferHeight = Math.max(1, this.virtualScrollBuffer) * this.cellHeight;

        const newCol = Math.floor(this.scrollX / bufferWidth) * this.virtualScrollBuffer;
        const newRow = Math.floor(this.scrollY / bufferHeight) * this.virtualScrollBuffer;

        this.setOffset(-(this.scrollX % bufferWidth), -(this.scrollY % bufferHeight));

        if (newCol !== this.virtualCol || newRow !== this.virtualRow) {
            this.virtualCol = newCol;
            this.virtualRow = newRow;
            if (this.onVirtualScroll) this.onVirtualScroll(this.virtualCol, this.virtualRow);
        }
    }

    /**
     * Returns the current screen text as a single string with newlines. Empty cells are returned as spaces.
     * Use sparingly (it's an expensive operation)
     * @returns {string}
     */
    getScreenText() {
        let text = "";
        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
                const charCode = this.gridBuffer[(row * this.cols + col) * 5];
                text += charCode ? String.fromCharCode(charCode) : " ";
            }
            text += "\n";
        }
        return text;
    }

    /**
     * Sets the screen text from a single string with newlines. Lines that exceed the grid width are truncated, and lines that exceed the grid height are ignored.
     * @param {string} text 
     */
    setScreenText(text) {
        const lines = text.split("\n");
        for (let row = 0; row < this.rows; row++) {
            const line = lines[row] || "";
            for (let col = 0; col < this.cols; col++) {
                const charCode = line.charCodeAt(col) || 32;
                this.setChar(col, row, charCode);
            }
        }
    }

    destroy() {
        if (this.destroyed) return;
        if (this.vertexBuffer) this.gl.deleteBuffer(this.vertexBuffer);
        if (this.indexBuffer) this.gl.deleteBuffer(this.indexBuffer);
        if (this.texture) this.gl.deleteTexture(this.texture);
        if (this.program) this.gl.deleteProgram(this.program);
        if (this.rectProgram) this.gl.deleteProgram(this.rectProgram);
        if (this.vao) this.gl.deleteVertexArray(this.vao);
        if (this.rectVao) this.gl.deleteVertexArray(this.rectVao);
        this.vertexData = null;
        this.indexData = null;
        this.gridBuffer = null;
        this.cmap = null;
        this.font = null;
        this.frameFunction = null;
        this.onVirtualScroll = null;
        this.textSelection = null;
        this.rectData = null;
        this.scrollX = 0;
        this.scrollY = 0;
        this.virtualCol = 0;
        this.virtualRow = 0;
        this.welcomeMsg = null;
        this.gridDirty = null;
        this.initialized = null;
        this.pendingResize = null;
        this.frameScheduler.destroy();
        this.frameScheduler = null;
        this.projMatrix = null;
        this.backgroundColor = null;
        this.gl = null;
        this.canvas = null;
        this.container.remove();
        this.container = null;
        this.program = null;
        this.rectProgram = null;
        this.locations = null;
        this.vao = null;
        this.rectVao = null;
        this.indexBuffer = null;
        this.texture = null;
        this.vertexBuffer = null;
        this.destroyed = true;
    }
}

/*
// Later in glitter
struct Piece : Array {
    u32 offset;
    u32 length;
    bit isAppend;
}

Piece(0, 0, 0); // [0, 0, 0]
Piece{ offset: 0, length: 0 } // [0, 0, 0]
*/


/**
 * Mutable text field
 */

class MutableTextField {
    constructor() {
        this.data = null; // Uint8Array for UTF-8 encoded text
        this.lines = null; // Uint32Array byte offsets
    }

    load(text) {
        if(text instanceof Uint8Array) {
            this.data = text;
        } else if(typeof text === "string") {
            this.data = textEncoder.encode(text);
        } else {
            throw new Error("Invalid text type, must be Uint8Array or string");
        }

        // Rough estimate for now
        this.lines = new Uint32Array((Math.ceil(this.data.length / 50) + 512) * 2);
        this.scanLines();
        return this;
    }

    getOriginalData() {
        return this.data;
    }

    getLineInfo(line) {
        if(line < 0 || line >= this.lines.length) {
            return null;
        }

        return [this.lines[line], this.lines[line + 1]];
    }

    scanLines() {
        // For now we scan the whole document
        // Later only scan by ranges to avoid iterating the whole document if not needed
        const data = this.data;
        const lines = this.lines;

        const len = data.length;
        let i = 0;
        let line = 0;

        // Unrolling is ~2x faster on Firefox, small or even slightly negative change on Chrome.
        // I will keep unrolling for Firefox and chrome will have to suck it

        for (; i <= len - 8; i += 8) {
            if (data[i + 0] === 10) { lines[line++] = i + 0 + 1; }
            if (data[i + 1] === 10) { lines[line++] = i + 1 + 1; }
            if (data[i + 2] === 10) { lines[line++] = i + 2 + 1; }
            if (data[i + 3] === 10) { lines[line++] = i + 3 + 1; }
            if (data[i + 4] === 10) { lines[line++] = i + 4 + 1; }
            if (data[i + 5] === 10) { lines[line++] = i + 5 + 1; }
            if (data[i + 6] === 10) { lines[line++] = i + 6 + 1; }
            if (data[i + 7] === 10) { lines[line++] = i + 7 + 1; }
        }

        // tail
        for (; i < len; i++) {
            if (data[i] === 10) lines[line++] = i + 1;
        }
    }

    destroy() {
        this.data = null;
        this.lines = null;
    }
}

class EditorState extends MutableTextField {
    constructor() {
        super();

        this.caretCol = 0;
        this.caretRow = 0;

        this.selectionCache = null;

        this.tokens = [];
        this.undoStack = [];
        this.redoStack = [];
    }

    destroy() {
        this.caretCol = null;
        this.caretRow = null;
        this.selectionCache = null;
        this.tokens = null;
        this.appendBuffer = null;
        this.pieces = null;
        this.undoStack = null;
        this.redoStack = null;
        super.destroy();
    }
}

/**
 * A high-performance, hardware-accelerated text/code editor!
 * Can handle virtually any amount of text seamlessly, and doesn't use DOM for text rendering.
 */
class CodeEditor extends AcceleratedTextGridRenderer {
    constructor(options = {}) {
        // Number of extra rows/columns to render beyond the viewport for smooth scrolling.
        // Large values will slow down rendering and may cause lagging, but small values make scrolling less efficient, so the best value is in a balance.
        options.virtualScrollBuffer = 32;
        options.virtualScrolling = true;

        super(options);

        // -- Setup container
        this.container.style.cursor = "text";
        this.container.tabIndex = 0;
        this.container.classList.add("ls-code-editor");

        // -- Editor state
        this.state = options.state || new EditorState();
        if(!(this.state instanceof EditorState)) {
            throw new Error("State must be an instance of EditorState");
        }

        // -- Theme
        this.theme = null;
        this.setTheme();

        // -- Other setup
        this.frameFunction = this.renderEditorFrame.bind(this);
        this.onVirtualScroll = (col, row) => {
            console.log(col, row);
            this.render();
        };
    }

    setTheme(theme = null) {
        const tempColor = new LS.Color();
        this.theme = {
            default: tempColor.set(theme && theme.default || "#aaaaaa").floatPixel,
            identifier: tempColor.set(theme && theme.identifier || "#4488ff").floatPixel,
            keyword: tempColor.set(theme && theme.keyword || "#ff4488").floatPixel,
            string: tempColor.set(theme && theme.string || "#44ff44").floatPixel,
            number: tempColor.set(theme && theme.number || "#ff8844").floatPixel,
            bg: tempColor.set(theme && theme.bg || "#000000").floatPixel
        };

        this.setOptions({ backgroundColor: this.theme.bg });
        this.render();
    }

    init(options = {}) {
        const promise = super.init(options);
        return promise;
    }

    switchState(newState) {}

    setText(text) {
        this.state.load(text);
    }
    
    getText() {
        return this.state.getText();
    }

    renderEditorFrame() {
        const totalLength = this.state.data.length;
    }

    destroy(destroyState = true) {
        if(this.destroyed) return;
        super.destroy();
        if(destroyState) {
            this.state.destroy();
        }
        this.state = null;
        this.theme = null;
        this.renderEditorFrame = null;
    }
}

// Export
window.CodeEditor = CodeEditor;
window.EditorState = EditorState;
window.AcceleratedTextGridRenderer = AcceleratedTextGridRenderer;