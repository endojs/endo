# Security Policy

## Supported Versions

The SES package and associated Endo packages are still undergoing development and security review, and all
users are encouraged to use the latest version available. Security fixes will
be made for the most recent branch only.

## Coordinated Vulnerability Disclosure of Security Bugs

SES stands for fearless cooperation, and strong security requires strong collaboration with security researchers. If you believe that you have found a security sensitive bug that should not be disclosed until a fix has been made available, we encourage you to report it. To report a bug in HardenedJS, you have several options that include:

* Reporting the issue to the [Agoric HackerOne vulnerability rewards program](https://hackerone.com/agoric).

* Sending an email to security at (@) agoric.com., encrypted or unencrypted. To encrypt, please use  @Warner’s personal GPG key  [A476E2E6 11880C98 5B3C3A39 0386E81B 11CAA07A](http://www.lothar.com/warner-gpg.html)  .

* Sending a message on Keybase to `@agoric_security`, or sharing code and other log files via Keybase’s encrypted file system. ((_keybase_private/agoric_security,$YOURNAME).

* It is important to be able to provide steps that reproduce the issue and demonstrate its impact with a Proof of Concept example in an initial bug report. Before reporting a bug, a reporter may want to have another trusted individual reproduce the issue.

* A bug reporter can expect acknowledgment of a potential vulnerability reported through  [security@agoric.com](mailto:security@agoric.com)  within one business day of submitting a report. If an acknowledgement of an issue is not received within this time frame, especially during a weekend or holiday period, please reach out again. Any issues reported to the HackerOne program will be acknowledged within the time frames posted on the program page.
	* The bug triage team and Agoric code maintainers are primarily located in the San Francisco Bay Area with business hours in  [Pacific Time](https://www.timeanddate.com/worldclock/usa/san-francisco) .

* For the safety and security of those who depend on the code, bug reporters should avoid publicly sharing the details of a security bug on Twitter, Discord, Telegram, or in public Github issues during the coordination process.

* Once a vulnerability report has been received and triaged:
	* Agoric code maintainers will confirm whether it is valid, and will provide updates to the reporter on validity of the report.
	* It may take up to 72 hours for an issue to be validated, especially if reported during holidays or on weekends.

* When the Agoric team has verified an issue, remediation steps and patch release timeline information will be shared with the reporter.
	* Complexity, severity, impact, and likelihood of exploitation are all vital factors that determine the amount of time required to remediate an issue and distribute a software patch.
	* If an issue is Critical or High Severity, Agoric code maintainers will release a security advisory to notify impacted parties to prepare for an emergency patch.
	* While the current industry standard for vulnerability coordination resolution is 90 days, Agoric code maintainers will strive to release a patch as quickly as possible.

When a bug patch is included in a software release, the Agoric code maintainers will:
	* Confirm the version and date of the software release with the reporter.
	* Provide information about the security issue that the software release resolves.
	* Credit the bug reporter for discovery by adding thanks in release notes, securing a CVE designation, or adding the researcher’s name to a Hall of Fame.
