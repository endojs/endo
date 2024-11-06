you need to defineClass every session. calling registerClass once ensures this happens every session. but if your code is running every session, just call defineClass

if it crosses a vat or is put in storage it needs to be durable so it needs to be defined

defineClass happens once
registerClass happens every start
incubate happens once
registerIncubation happens every start
