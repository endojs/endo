# [Secure EcmaScript (SES)](https://a.org/)
[![npm version][npm-svg]][npm-url]
[![build status][circleci-svg]][circleci-url]
[![dependency status][deps-svg]][deps-url]
[![dev dependency status][dev-deps-svg]][dev-deps-url]
[![contributing][contributing-svg]][contributing-url]
[![license][license-image]][license-url]

Secure EcmaScript (SES) is an execution environment which enables fine-grained sandboxing.

* **Compartments**
* **Strict mode**
* **Frozen realm** By freezing everything intrinsics, SES removes programs abilities to interfere with each other.
* **POLA** By default, the compartments received no ambient authorthy.

[Learn how to use SES in your own project](https://ses-secure-ecmascript.readthedocs.io/en/latest).

## Installation

React has been designed for gradual adoption from the start, and **you can use as little or as much React as you need**:

* Use [Online Playgrounds](https://reactjs.org/docs/getting-started.html#online-playgrounds) to get a taste of React.
* [Add React to a Website](https://reactjs.org/docs/add-react-to-a-website.html) as a `<script>` tag in one minute.
* [Create a New React App](https://reactjs.org/docs/create-a-new-react-app.html) if you're looking for a powerful JavaScript toolchain.

You can use React as a `<script>` tag from a [CDN](https://reactjs.org/docs/cdn-links.html), or as a `react` package on [npm](https://www.npmjs.com/).

## Documentation

You can find the React documentation [on the website](https://reactjs.org/docs).  

Check out the [Getting Started](https://reactjs.org/docs/getting-started.html) page for a quick overview.

The documentation is divided into several sections:

* [Tutorial](https://reactjs.org/tutorial/tutorial.html)
* [Main Concepts](https://reactjs.org/docs/hello-world.html)
* [Advanced Guides](https://reactjs.org/docs/jsx-in-depth.html)
* [API Reference](https://reactjs.org/docs/react-api.html)
* [Where to Get Support](https://reactjs.org/community/support.html)
* [Contributing Guide](https://reactjs.org/docs/how-to-contribute.html)

You can improve it by sending pull requests to [this repository](https://github.com/reactjs/reactjs.org).

## Examples

We have several examples [on the website](https://reactjs.org/). Here is the first one to get you started:

```jsx
function HelloMessage({ name }) {
  return <div>Hello {name}</div>;
}

ReactDOM.render(
  <HelloMessage name="Taylor" />,
  document.getElementById('container')
);
```

This example will render "Hello Taylor" into a container on the page.

You'll notice that we used an HTML-like syntax; [we call it JSX](https://reactjs.org/docs/introducing-jsx.html). JSX is not required to use React, but it makes code more readable, and writing it feels like writing HTML. If you're using React as a `<script>` tag, read [this section](https://reactjs.org/docs/add-react-to-a-website.html#optional-try-react-with-jsx) on integrating JSX; otherwise, the [recommended JavaScript toolchains](https://reactjs.org/docs/create-a-new-react-app.html) handle it automatically.

## Contributing

The main purpose of this repository is to continue to evolve SES, making it safer, faster and easier to use. Development of React happens in the open on GitHub, and we are grateful to the community for contributing bugfixes and improvements. Read below to learn how you can take part in improving React.

Read our [contributing guide](./CONTRIBUTING.md) to learn about our development process, how to propose bugfixes and improvements, and how to build and test your changes.

### Bug Disclosure

Please help us practice coordinated security bug disclosure, by using the
instructions in our [security guide](./SECURITY.md) to report security-sensitive bugs privately.

For non-security bugs, please use the [regular Issues
page](https://github.com/Agoric/SES/issues).

### License

SES is [Apache 2.0 licensed](./LICENSE).

[npm-svg]: https://img.shields.io/npm/v/ses.svg?style=flat
[npm-url]: https://www.npmjs.com/package/ses
[circleci-svg]: https://circleci.com/gh/Agoric/ses.svg?style=svg
[circleci-url]: https://circleci.com/gh/Agoric/ses
[deps-svg]: https://david-dm.org/Agoric/ses.svg
[deps-url]: https://david-dm.org/Agoric/ses
[dev-deps-svg]: https://david-dm.org/Agoric/ses/dev-status.svg
[dev-deps-url]: https://david-dm.org/Agoric/ses?type=dev
[contributing-svg]: https://img.shields.io/badge/PRs-welcome-brightgreen.svg
[license-image]: https://img.shields.io/badge/License-Apache%202.0-blue.svg
