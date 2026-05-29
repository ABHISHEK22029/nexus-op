const { PDFParse } = require('pdf-parse');
const pdfParse = (buf) => new PDFParse().parse(buf);
const fs = require('fs');

const dataBuffer = fs.readFileSync('C:/Users/abhis/Downloads/Nexus-OP_Field_Specification (1).pdf');

pdfParse(dataBuffer).then(function(data) {
    console.log('Pages:', data.numpages);
    console.log('Total chars:', data.text.length);
    fs.writeFileSync('C:/Users/abhis/Downloads/poc_COMPLETE_FINAL/spec_text.txt', data.text, 'utf8');
    console.log('Saved to spec_text.txt');
    console.log('--- PREVIEW ---');
    console.log(data.text.substring(0, 4000));
}).catch(function(err) {
    console.error('Error:', err.message);
});
