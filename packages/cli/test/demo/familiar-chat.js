// Todo: web app should be tested in a browser emulator
export async function section(testLine, execa) {
  // Familiar Chat is an example application that provides a web app...
  await testLine(
    execa`endo install cat.js --listen 8920 --powers AGENT --name familiar-chat`,
  );
  // await testLine(execa`endo open familiar-chat`);

  // So, if you were to simulate a request from your cat:
  await testLine(execa`endo mkguest cat cat-agent`);
  await testLine(execa`endo request HOST 'pet me' --as cat-agent`);

  // If you enter the name counter and press [resolve] and return to your terminal...
}
