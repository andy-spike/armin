# Open-source licensing and a paid Armin service

Research note, 28 October 2026. This is decision support, not legal advice.

## The central tradeoff

An open-source license permits commercial use, modification and redistribution by others. It does not prevent Armin from charging for its own hosted service or features. However, if the paid features' code is open source, recipients can generally modify or run their own copy, including removing its payment checks. A license cannot guarantee exclusivity over those features and still meet the [Open Source Definition](https://opensource.org/osd). OSI explicitly confirms that open-source software may be sold and that competitors may sell it too: [OSI FAQ](https://opensource.org/faq).

For Armin, paid hosted accounts can offer convenience, synchronization, reliable infrastructure, support, or metered resources such as AI services. Checks on Armin's own backend can enforce the hosted service's plan; someone running a fork controls their own backend. Names and logos have separate trademark considerations; open-source licensing does not automatically give others rights to the project's brand ([OSI FAQ](https://opensource.org/faq)).

## Options

| License                                                   | What it permits and requires                                                                                                                                                                  | Fit                                                                                                                                |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| [MIT](https://opensource.org/license/mit)                 | Permissive: retain copyright and license notices when distributing copies or substantial portions. Others may sell, modify and redistribute, including in proprietary products.               | Simplest; no obligation for a competing service to share changes. Current license already permits paid hosting.                    |
| [Apache 2.0](https://www.apache.org/licenses/LICENSE-2.0) | Permissive, with explicit contributor patent grants, patent litigation termination, and notice/change requirements. Proprietary derivatives are possible.                                     | Similar commercial openness to MIT, with more explicit patent terms.                                                               |
| [MPL 2.0](https://www.mozilla.org/en-US/MPL/2.0/)         | File-level copyleft: distribution of covered files and modifications carries source and license obligations, while separate files can form a larger work.                                     | Middle ground for distributed code, but network use alone does not trigger source sharing.                                         |
| [GPLv3](https://www.gnu.org/licenses/gpl-3.0.html)        | Strong copyleft on distribution of covered works; corresponding source must be provided under its terms. Network use alone does not generally trigger distribution requirements.              | Encourages sharing when software is distributed, less effective for hosted competitors.                                            |
| [AGPLv3](https://www.gnu.org/licenses/agpl-3.0.html)      | GPL-style copyleft plus section 13: operators who modify the program and let users interact with it over a network must offer those users the corresponding source of their modified version. | Strongest listed fit if reciprocal sharing by hosted forks matters. It still permits competitors to operate paid or free services. |

See [GNU's license FAQ](https://www.gnu.org/licenses/gpl-faq.en.html) for source and network obligations and [GNU's application guidance](https://www.gnu.org/licenses/gpl-howto.en.html) for offering source to network users. Copyleft scope and how separately deployed components interact require case-specific analysis; it is not safe to assume every dependency or service automatically falls under one license.

## Other business choices

The copyright holder may offer the same code under an additional commercial license, for example to customers who need different terms. This depends on having necessary rights from contributors and third-party licensors; it does not prevent use under the open-source license. See [GNU on selling exceptions](https://www.gnu.org/philosophy/selling-exceptions.html). A publicly visible license that restricts competing services or requires payment for commercial use can preserve more exclusivity, but is **source-available**, not open source under the OSI definition.

## Practical recommendation and transition

Choose AGPLv3 if hosted forks sharing their modifications is a priority; retain MIT if maximum simplicity and permissive adoption matter more. Either supports paid features on the official service. Before changing licenses, inventory authorship, third-party code and dependency licenses, and review compatibility for web, mobile, backend and distributed artifacts. Confirm whether any MIT-licensed version was actually shared: a later change does not undo rights already granted to recipients of earlier versions. The owner can license their own future work differently, subject to others' rights. Have a lawyer familiar with the relevant jurisdictions review the choice, contributor policy, mobile distribution and any commercial terms before release. Do not replace the license solely on the basis of this note.
