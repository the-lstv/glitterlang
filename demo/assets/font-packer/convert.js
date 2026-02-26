const fs = require("fs");
const pngjs = require("pngjs");
const path = require("path");
const minimist = require("minimist");
const args = minimist(process.argv.slice(2));
console.log(args);
process.exit(0);

/**
 * The point of this script is to obtain the glyph information for ligatures to support coding ligatures.
 * Sadly there is no cleaner way to do that :(
 * 
 * The shaper library is not perfect and returns quite inefficient maps
 */
async function main(params) {

    // --- Definitions

    const fontPath = args.fontPath || path.join(__dirname, "..", args.font || "JetBrainsMono[wght].ttf");
    const fontName = args.name || path.basename(fontPath, path.extname(fontPath));

    const outputDir = args.outputDir || args.o || path.join(__dirname, "..", "fonts", fontName);
    if(!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // The charset we support
    const sets = {
        base:            " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~ ¡¢£¤¥¦§¨©ª«¬­®¯°±²³´µ¶·¸¹º»¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüůýþÿ~",
        diacritics:      "ÁĂẮẶẰẲẴǍÂẤẬẦẨẪÄẠÀẢĀĄÅÃÆǼĆČÇĈĊÐĎĐÉĔĚÊẾỆỀỂỄËĖẸÈẺĒĘƐẼǴĞǦĜĢĠĦĤÍĬÎÏİỊÌỈĪĮĨĴĶĹĽĻĿŁŃŇŅŊÑÓŎÔỐỘỒỔỖÖỌÒỎƠỚỢỜỞỠŐŌǪØǾÕŒÞŔŘŖŚŠŞŜȘẞƏŦŤŢȚÚŬÛÜỤÙỦƯỨỰỪỬỮŰŪŲŮŨẂŴẄẀÝŶŸỴỲỶȲỸŹŽŻáăâäàāąåãæǽćčçĉċðďđéĕěêëėèēęəğǧĝġħĥiıíĭîïìīįĩjȷĵĸlĺľŀłmnńŉňŋñóŏôöòơőōøǿõœþŕřsśšşŝßſŧťúŭûüùưűūģķļņŗţǫǵșțạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỵỷỹųůũẃŵẅẁýŷÿỳzźžż",
        extras:          "₿¢¤$₫€ƒ₴₽£₮¥≃∵≬⋈∙≔∁≅∐⎪⋎⋄∣∕∤∸⋐⋱∈∊⋮∎⁼≡≍∹∃∇≳∾⥊⟜⎩⎨⎧⋉⎢⎣⎡≲⋯∓≫≪⊸⊎⨀⨅⨆⊼⋂⋃≇⊈⊉⊽⊴≉∌∉≭≯≱≢≮≰⋢⊄⊅+−×÷=≠><≥≤±≈¬~^∞∅∧∨∩∪∫∆∏∑√∂µ∥⎜⎝⎛⎟⎠⎞%‰﹢⁺≺≼∷≟∶⊆⊇⤖⎭⎬⎫⋊⎥⎦⎤⊢≗∘∼⊓⊔⊡⊟⊞⊠⊏⊑⊐⊒⋆≣⊂≻∋⅀⊃⊤⊣∄∴≋∀⋰⊥⊻⊛⊝⊜⊘⊖⊗⊙⊕↑↗→↘↓↙←↖↔↕↝↭↞↠↢↣↥↦↧⇥↩↪↾⇉⇑⇒⇓⇐⇔⇛⇧⇨⌄⌤➔➜➝➞⟵⟶⟷●○◯◔◕◶◌◉◎◦◆◇◈◊■□▪▫◧◨◩◪◫▲▶▼◀△▷▽◁►◄▻◅▴▸▾◂▵▹▿◃⌶⍺⍶⍀⍉⍥⌾⍟⌽⍜⍪⍢⍒⍋⍙⍫⍚⍱⍦⍎⍊⍖⍷⍩⍳⍸⍤⍛⍧⍅⍵⍹⎕⍂⌼⍠⍔⍍⌺⌹⍗⍌⌸⍄⌻⍇⍃⍯⍰⍈⍁⍐⍓⍞⍘⍴⍆⍮⌿⌷⍣⍭⍨⍲⍝⍡⍕⍑⍏⍬⚇⚠⚡✓✕✗✶@&¶§©®™°′″|¦†ℓ‡№℮␣⎋⌃⌞⌟⌝⌜⎊⎉⌂⇪⌫⌦⌨⌥⇟⇞⌘⏎⏻⏼⭘⏽⏾⌅�˳˷",
        blockSymbols:    "▁▂▃▄▅▆▇█▀▔▏▎▍▌▋▊▉▐▕▖▗▘▙▚▛▜▝▞▟░▒▓",
        boxSymbols:      "┌└┐┘┼┬┴├┤─│╡╢╖╕╣║╗╝╜╛╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪━┃┄┅┆┇┈┉┊┋┍┎┏┑┒┓┕┖┗┙┚┛┝┞┟┠┡┢┣┥┦┧┨┩┪┫┭┮┯┰┱┲┳┵┶┷┸┹┺┻┽┾┿╀╁╂╃╄╅╆╇╈╉╊╋╌╍╎╏╭╮╯╰╱╲╳╴╵╶╷╸╹╺╻╼╽╾╿",
        punct:           ".,:;…!¡?¿·•*⁅⁆#․‾/\\‿(){}[]❰❮❱❯⌈⌊⌉⌋⦇⦈-­–—‐_‚„“”‘’«»‹›‴\"'⟨⟪⟦⟩⟫⟧·;",
        numbers:         "0123456789₀₁₂₃₄₅₆₇₈₉⁰¹²³⁴⁵⁶⁷⁸⁹½¼¾↋↊૪",
        cyrillicCharset: "АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя",
        greekCharset:    "ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩαβγδεζηθικλμνξοπρστυφχψω"
    }

    // These are ligatures supported by JetBrains Mono
    let ligatures = ["--","---","==","===","!=","!==","=!=","=:=","=/=","<=",">=","&&","&&&","&=","++","+++","***",";;","!!","??","???","?:","?.","?=","<:",":<",":>",">:","<:<","<>","<<<",">>>","<<",">>","||","-|","_|_","|-","||-","|=","||=","##","###","####","#{","#[","]#","#(","#?","#_","#_(","#:","#!","#=","^=","<$>","<$","$>","<+>","<+","+>","<*>","<*","*>","</","</>","/>","\x3C!--","<#--","-->","->","->>","<<-","<-","<=<","=<<","<<=","<==","<=>","<==>","==>","=>","=>>",">=>",">>=",">>-",">-","-<","-<<",">->","<-<","<-|","<=|","|=>","|->","<->","<<~","<~~","<~","<~>","~~","~~>","~>","~-","-~","~@","[||]","|]","[|","|}","{|","[<",">]","|>","<|","||>","<||","|||>","<|||","<|>","...","..",".=","..<",".?","::",":::",":=","::=",":?",":?>","//","///","/*","*/","/=","//=","/==","@_","__","???",";;;"];

    // Extensions
    const default = "base";
    const include = args.include;
    const exclude = args.exclude;
    const charset = Object.keys(sets).fiter( /** ffs moving again */


    // ---


    // text-shaper does not work with ligatures
    const HarfBuzz = await require("harfbuzzjs");
    const { Font, shape, feature, UnicodeBuffer, buildMsdfAtlas, msdfAtlasToRGBA } = await import("text-shaper");

    const start = performance.now();

    const font = Font.load(fs.readFileSync(fontPath).buffer);
    const glyphIds = new Set();

    if (!args.noLigatures && ligatures.length > 0) {
        const blob = HarfBuzz.createBlob(fs.readFileSync(fontPath).buffer); // ArrayBuffer
        const face = HarfBuzz.createFace(blob);
        const font = HarfBuzz.createFont(face);
        const buffer = HarfBuzz.createBuffer();
        buffer.addText(ligatures.join(""));
        buffer.guessSegmentProperties();
        HarfBuzz.shape(font, buffer, ["liga", "calt", "clig", "dlig"].join(","));
        const result = buffer.json(font);
        // console.log(result);

        for (let info of result) {
            glyphIds.add(info.g);
        }
    }

    // Add character glyphs
    for (let i = 0; i < charset.length; i++) {
        const char = charset[i];
        const codePoint = char.codePointAt(0);
        const glyphId = font.glyphId(codePoint);
        glyphIds.add(glyphId);
    }

    // Build atlas
    const atl = buildMsdfAtlas(font, [...glyphIds.values()], {
        fontSize: 32,
        spread: 4,
        padding: 0,
        maxWidth: 1024,
    });

    // Save atlas as PNG
    const rgba = msdfAtlasToRGBA(atl);
    storeAtlas(atl, rgba, outputDir + "/atlas.png");

    // Save font info as JSON
    const fontInfo = {
        glyphs: [...glyphIds.values()],
        atlas: {
            width: atl.bitmap.width,
            rows: atl.bitmap.rows,
        },
    };

    fs.writeFileSync(outputDir + "/font.json", JSON.stringify(fontInfo));

    const end = performance.now();
    console.log(`Converted ${glyphIds.size} glyphs in ${(end - start).toFixed(2)} ms. Saved as ${outputDir}/atlas.png and ${outputDir}/font.json`);
}

function storeAtlas(atlas, rgba, path) {
    const { width, rows } = atlas.bitmap;

    // Create a PNG with colorType 6 = RGBA
    const png = new pngjs.PNG({
        width,
        height: rows,
        colorType: 6, // RGBA
    });

    if (rgba.length !== width * rows * 4) {
        throw new Error(`RGBA buffer length mismatch: expected ${width * rows * 4}, got ${rgba.length}`);
    }

    png.data.set(rgba);

    const writeStream = fs.createWriteStream(path);
    png.pack().pipe(writeStream);
}

main();