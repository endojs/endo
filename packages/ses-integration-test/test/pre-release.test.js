import testBundler from "./utility/bundler.test";

testBundler("mock unpkg umd", "../../scaffolding/mock-unpkg-umd/index.html");
testBundler("webpack", "../../scaffolding/webpack/index.html");
testBundler("rollup", "../../scaffolding/rollup/index.html");
testBundler("parcel", "../../bundles/parcel/index.html");
testBundler("browserify", "../../scaffolding/browserify/index.html");
