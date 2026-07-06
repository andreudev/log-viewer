import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: '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',
  baseURL: 'https://integrate.api.nvidia.com/v1',
})
 
async function main() {
  console.log('Enviando petición a NVIDIA NIM...');
  const startTime = Date.now();
  try {
    const completion = await openai.chat.completions.create({
      model: "meta/llama-3.3-70b-instruct",
      messages: [{"role":"user","content":"Responde solo con la palabra TEST"}],
      temperature: 0.2,
      top_p: 0.7,
      max_tokens: 1024,
      stream: false
    });
    const endTime = Date.now();
    console.log(`Respuesta recibida en ${endTime - startTime}ms:`);
    console.log(completion.choices[0]?.message?.content);
  } catch (error) {
    console.error('Error en la petición:', error.message);
  }
}

main();
