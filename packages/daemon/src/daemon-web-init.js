import './daemon-web.js'

globalThis.startDaemon({
  makeWebWorker () {
    console.log('making endo worker in subworker')
    const worker = new Worker('./dist-worker-web-init-bundle.js', {
      name: 'Endo Worker',
    });
    return worker;
  }
});