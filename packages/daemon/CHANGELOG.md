# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [2.2.0](https://github.com/endojs/endo/compare/@endo/daemon@2.1.0...@endo/daemon@2.2.0) (2024-04-04)


### Features

* **daemon:** Add bidirectional multimap ([9819fca](https://github.com/endojs/endo/commit/9819fca32a8cf244d91b839e1a86a2995f337ff8))
* **daemon:** Add daemon locator strings ([2cfb7f7](https://github.com/endojs/endo/commit/2cfb7f7f4abdf8f0cba2e36ce9cb89414d2432fe))
* **daemon:** Add directory `locate()` method ([8977958](https://github.com/endojs/endo/commit/89779589db009b3f7919af5759ee659aff933bc1))
* **daemon:** Add makeMultimap() ([aaef687](https://github.com/endojs/endo/commit/aaef6875ccdf33fb83008f4a0ac9556ecc59ce0b))


### Bug Fixes

* **daemon:** Do not publish changes for redundant pet store writes ([a96b8af](https://github.com/endojs/endo/commit/a96b8afa0327e9e4a160cad5bcb3cfb123b79c47))
* **daemon:** Enable `locate()` of remote values ([11198d0](https://github.com/endojs/endo/commit/11198d09b8ff2e3e11aae365b83cc402ce98a811))



## [2.1.0](https://github.com/endojs/endo/compare/@endo/daemon@2.0.0...@endo/daemon@2.1.0) (2024-03-20)


### Features

* **daemon:** add directory ([ad171f1](https://github.com/endojs/endo/commit/ad171f12359614f47f41d25ea090fea7fdefca6c))
* **daemon:** add empty networks dir + peer formula + invite/accept ([b9c8872](https://github.com/endojs/endo/commit/b9c88720dab64694a1e51b4de271e4c80790d5bf))
* **daemon:** add list and followChanges to NameHub ([9024a5b](https://github.com/endojs/endo/commit/9024a5bb6f856d0ffdc3c98e5b82cd2b05a7d3ca))
* **daemon:** add loopback network ([53d4120](https://github.com/endojs/endo/commit/53d41206291bc3ddd1216a4117e8591bb6da944c))
* **daemon:** Create weblet worklet for Node.js ([9b17973](https://github.com/endojs/endo/commit/9b1797376c6a58ded62701c311f34fba7e18c7d8))
* **daemon:** enhance types for DaemonCore and consumers ([15529d7](https://github.com/endojs/endo/commit/15529d727bdaa3e174467647b83a8ef40c8a9b10))
* **daemon:** Expose own id to evaluate and make behaviors ([66dbbcf](https://github.com/endojs/endo/commit/66dbbcffb3c13851cba329273c369184f3833162))
* **daemon:** improve types for Host and Guest ([8ae0178](https://github.com/endojs/endo/commit/8ae01784ef6c1398763ad4be5869463f395554a0))
* **daemon:** include locationId in formulaId ([cb3e2c5](https://github.com/endojs/endo/commit/cb3e2c54ea52086facd5b00ed079c4f27dd0adde))
* **daemon:** Inject platform capabilities as formulas ([f0d17a6](https://github.com/endojs/endo/commit/f0d17a6962484e24e5a49d46ad5198c7fcad9b4a))
* **daemon:** Log node identifier ([05d1566](https://github.com/endojs/endo/commit/05d1566f821873db3845539fa986620b5a18b3cd))
* **daemon:** NameHubs expose listIdentifiers method ([375c3e9](https://github.com/endojs/endo/commit/375c3e968cc3de0769aaf6ad9f4d2ed3954b0aa0))
* **daemon:** only provide local values over gateway ([622da83](https://github.com/endojs/endo/commit/622da83c7254ee4890160d806c8368bf35be645c))
* **daemon:** peer info exchange methods + remote lookup ([b850b6c](https://github.com/endojs/endo/commit/b850b6c864ee4c3db6a4fd35a726d9a1e018dd39))
* **daemon:** remove listEntries and followEntries in PetStore/Host/Guest ([5512bf6](https://github.com/endojs/endo/commit/5512bf6d530aeef6b929dbdf0f33987972613a3b))
* **daemon:** rename "location" to "node" ([793adef](https://github.com/endojs/endo/commit/793adefb2eeed5f49443fa841df96239f097dbc3))
* **daemon:** separate peer and remote formulas ([a1abc36](https://github.com/endojs/endo/commit/a1abc3610cd3facccaa91223e2c5583965cc4d90))
* **ses-ava:** import test from @endo/ses-ava/prepare-endo.js ([#2133](https://github.com/endojs/endo/issues/2133)) ([9d3a7ce](https://github.com/endojs/endo/commit/9d3a7ce150b6fd6fe7c8c4cc43da411e981731ac))


### Bug Fixes

* **daemon:** Catch up init dev dependency to adjacent workspace ([1fd5182](https://github.com/endojs/endo/commit/1fd518251895445ff87ad7fcc1121c2b66d45f9b))
* **daemon:** directory.listIdentifiers is sorted ([d4e4701](https://github.com/endojs/endo/commit/d4e47012a0d70a06eec40fec4f2908ed7563b549))
* **daemon:** fix identifiedDirectory far interface ([70e5eac](https://github.com/endojs/endo/commit/70e5eac85462b069214c7809fbd67654f8e60222))
* **daemon:** fix leastAuthority type issue ([c2cdd7f](https://github.com/endojs/endo/commit/c2cdd7f208c479f880fa639c6d4a1e574b31d864))
* **daemon:** fix loopback network error message format ([01812a2](https://github.com/endojs/endo/commit/01812a282ad1820bbe985ef63845ee1a28dfe6ad))
* **daemon:** Fix provision of new, unnamed workers ([fb2c255](https://github.com/endojs/endo/commit/fb2c2557464711b95766797ebfbc4531624ee766)), closes [#2139](https://github.com/endojs/endo/issues/2139)
* **daemon:** fix some type issues ([184dc61](https://github.com/endojs/endo/commit/184dc6138a6e3f5ad8f0a871af048d3ed7e23ae3))
* **daemon:** Handle server response error ([ac44064](https://github.com/endojs/endo/commit/ac440640fb15d15ac1722db7b22d882bd056201e))
* **daemon:** loopback network should not advertise its address ([cb55c2d](https://github.com/endojs/endo/commit/cb55c2de043930517e03e0dc638bc01f6bb294c9))
* **daemon:** remove invite/accept and RemoteFormula ([3173724](https://github.com/endojs/endo/commit/31737240e51ffce8a1dbe94b7c31446763ae6b45))
* **daemon:** remove orphaned remote formula type check ([e08f03e](https://github.com/endojs/endo/commit/e08f03ef11b27d435daaac1e4c5e683e0c3aac37))
* **daemon:** rename "makeRemote" to "provideRemoteValue" ([f0451bd](https://github.com/endojs/endo/commit/f0451bd3722c74956cfad93c8891a8eb7ec88a7e))
* **daemon:** rename Gateway and Peer method to "provide" ([9ad0e3c](https://github.com/endojs/endo/commit/9ad0e3cbc5efa3f89cb67703b96fad35062b098d))
* **daemon:** Specify return type of evaluate ([6026b73](https://github.com/endojs/endo/commit/6026b73b099a4ebcbd6477d3d2fdf2749f738293))



## [2.0.0](https://github.com/endojs/endo/compare/@endo/daemon@1.0.3...@endo/daemon@2.0.0) (2024-02-23)


### ⚠ BREAKING CHANGES

* **daemon:** Despecify id512/sha512 in formula type
* **daemon:** Change unsafe import formula from path to specifier
* **daemon,cli:** Rename internals using "unsafe"
* **daemon:** Remove receive method
* **daemon:** Rename lookup to reverseLookup
* **daemon:** Add recipient name argument to Guest request method, allowing HOST

### Features

* **cli,daemon:** Make packages private ([986af72](https://github.com/endojs/endo/commit/986af720a64af07a4e5d6435ed9820727f2f283f))
* **cli,daemon:** Support dot-delimited petname paths in eval ([d35bbe2](https://github.com/endojs/endo/commit/d35bbe23f9f0bdea928e5b8f6b50328a90f9c71f))
* **daemon,cli:** Rename internals using "unsafe" ([5623d60](https://github.com/endojs/endo/commit/5623d608056586c33d3d35798d8171d6ac69c5a5))
* **daemon:** add "has" method to pet-store ([aff6fa8](https://github.com/endojs/endo/commit/aff6fa867eff50ee9ad8fcc7b9db69d0d3757f8a))
* **daemon:** add handle and provideControllerForFormulaIdentifierAndResolveHandle ([f92d751](https://github.com/endojs/endo/commit/f92d7511e6899773594cb4cd22d1d726db3f0cb4))
* **daemon:** Add host provideWorker method ([d64f47b](https://github.com/endojs/endo/commit/d64f47bdf034c8f5438179c617dc6d9d61eceeca))
* **daemon:** add incarnateBundle ([41fa16b](https://github.com/endojs/endo/commit/41fa16b967113347c403c27188436e4386a48760))
* **daemon:** add incarnateEval ([0bd689d](https://github.com/endojs/endo/commit/0bd689d2da01ad306caaa63f897e0a4555dfb5f3))
* **daemon:** add incarnateGuest ([e82a7b7](https://github.com/endojs/endo/commit/e82a7b75ec3d2737afd9590eaa03b2b657132303))
* **daemon:** add incarnateLeastAuthority ([073d46d](https://github.com/endojs/endo/commit/073d46d1e3db2cecb4cd6f3b55ce6ab3caa39b05))
* **daemon:** add incarnateLookup ([9fbbfb3](https://github.com/endojs/endo/commit/9fbbfb32cd305bc892af2dd64457cef7f27864c7))
* **daemon:** add incarnatePetInspector ([a108e7b](https://github.com/endojs/endo/commit/a108e7bfec5ccb7bc01301bafc5010179e0adfa6))
* **daemon:** add incarnatePetStore ([8cece42](https://github.com/endojs/endo/commit/8cece42acfe27fb90c07f7741c9cf824cf41ae4e))
* **daemon:** add incarnateReadableBlob ([628f903](https://github.com/endojs/endo/commit/628f9035de70431921b5e9ce9c8f85f2901dbc27))
* **daemon:** add incarnateUnconfined ([b391c25](https://github.com/endojs/endo/commit/b391c258d9085cc624880d4fc99d6d1e2831ccc8))
* **daemon:** add incarnateWebBundle ([bbcdc11](https://github.com/endojs/endo/commit/bbcdc119bbcca91308fe6f28d7fa34e84494b790))
* **daemon:** add incarnateWorker ([729d4aa](https://github.com/endojs/endo/commit/729d4aa8991febd37d774f1194fd9071024b561a))
* **daemon:** Add inspector types ([e7898f0](https://github.com/endojs/endo/commit/e7898f05c84e3717312dc48f86716a0c51bd303d))
* **daemon:** Add mailbox petname path lookup ([85cd6e6](https://github.com/endojs/endo/commit/85cd6e66341daab3b8ae8b856d4b8166d8d9e762))
* **daemon:** Add TCP connect to Node powers ([82c45af](https://github.com/endojs/endo/commit/82c45af49fabcf484aa3837e3a24bcb05b0e9806))
* **daemon:** can specify introducedNames in provideHost and provideGuest ([047e447](https://github.com/endojs/endo/commit/047e4471c6f081a4cca6be68d8dedf741d202396))
* **daemon:** Clean up socket on halt ([3b96b5a](https://github.com/endojs/endo/commit/3b96b5a8762f9224d2fe9bcdeebccc80c82ee357))
* **daemon:** Dismissal orthogonal to resolution ([36b28fc](https://github.com/endojs/endo/commit/36b28fc6234e99dcaff9f383446de10029e68eb4))
* **daemon:** Export reader-ref ref-reader individually ([7c64fc2](https://github.com/endojs/endo/commit/7c64fc28c4679f9bc83cba4a34f9ddffc6bd3df2))
* **daemon:** expose all incarnate methods on daemonCore ([0c6daf5](https://github.com/endojs/endo/commit/0c6daf55a82a2389ed8c6f690ecf19c17e09ec76))
* **daemon:** expose listEntries and followEntries on host and guest ([2ce0938](https://github.com/endojs/endo/commit/2ce09385719ca3b7ecb4949de120623111dda07a))
* **daemon:** expose pet-store "has" method to host and guest ([5769393](https://github.com/endojs/endo/commit/57693937cd99a3e4977fef56a2c3bb06edad30f4))
* **daemon:** expose petStore on host/guest internal facet ([481e3cb](https://github.com/endojs/endo/commit/481e3cb3607896996aacb48576bebc5e5ae098f6))
* **daemon:** Formulas and Pet Stores ([4ca2779](https://github.com/endojs/endo/commit/4ca2779b01147b971b7fa8c4d9e2eaee333e005e))
* **daemon:** Implement followInbox ([160a0ba](https://github.com/endojs/endo/commit/160a0ba58ea0fc59251ad0d0511e579e63e79c80))
* **daemon:** Implement message send for host and guest parties ([22f873e](https://github.com/endojs/endo/commit/22f873e5848e29a118ce0b9bee0620d9e7be3be7))
* **daemon:** in host breakout makeHost/makeGuest from provideHost/provideGuest ([c5b5104](https://github.com/endojs/endo/commit/c5b51047bebcbd132c65f81991669b084bf38846))
* **daemon:** include formula identifiers in package messages ([eb559f7](https://github.com/endojs/endo/commit/eb559f74c18f52cf46bcb6d93cb46c4fccd95837))
* **daemon:** Inline temporary pubsub implementation ([82f23b4](https://github.com/endojs/endo/commit/82f23b46bee265ffe3e6593aa7e76256ec0d4450))
* **daemon:** List special names ([c3516f4](https://github.com/endojs/endo/commit/c3516f42904eb20a676decc675c162122d7c35a1))
* **daemon:** mailbox tracks recipient ([59a9630](https://github.com/endojs/endo/commit/59a96302cea2dcc99c5b6ed8ffcaf304e9f1ed8c))
* **daemon:** Main worker for each host and guest ([28d28bd](https://github.com/endojs/endo/commit/28d28bdf4dd0614ab911e92f996d8ae3a8b48706))
* **daemon:** must use incarnateBundler to make the web-page-js bundler ([1f694c7](https://github.com/endojs/endo/commit/1f694c73600af7ea8cbcc8fe9d9d3901e4cce2f3))
* **daemon:** must use incarnateHost to make a new host ([89d9418](https://github.com/endojs/endo/commit/89d9418a39f7cf965ab9ab43e6be6188d0129839))
* **daemon:** Node socket server exposes assigned port ([d0a9168](https://github.com/endojs/endo/commit/d0a9168f79595e1fb9ef05566003acf5d994f589))
* **daemon:** Persistable worker endowments ([cd5a84b](https://github.com/endojs/endo/commit/cd5a84bd2f3e37320cfc2f6485999a0c4887e98a))
* **daemon:** Pet names, spawn, eval, store, durable ephemera, worker termination refactor ([b07f7b3](https://github.com/endojs/endo/commit/b07f7b3881ea657d29ac9aca364c607e798f813a))
* **daemon:** petstore follow includes value + add listEntries ([025d754](https://github.com/endojs/endo/commit/025d7541566235552c7d89c96af3a0c8aaab7910))
* **daemon:** Publish pet store name list changes ([58d8f2d](https://github.com/endojs/endo/commit/58d8f2d39775fbe3c08744696df30df69644eb93))
* **daemon:** RefReader and ReaderRef ([cce8d8f](https://github.com/endojs/endo/commit/cce8d8ff5946eea1cafe4f9f25bdef3de4a9e1e9))
* **daemon:** Reify inboxes and outboxes ([11f86a5](https://github.com/endojs/endo/commit/11f86a552d25570596ef20fc0928989abcdb8687))
* **daemon:** Release CLI if Endo start fails ([ea55ff6](https://github.com/endojs/endo/commit/ea55ff6a2660942fec048edc102f4faa879fced4))
* **daemon:** request messages are sent to own inbox ([26f6c01](https://github.com/endojs/endo/commit/26f6c01ff6324ad441b9bd1dfa6e5e1fec50fa4e))
* **daemon:** Reset restarts if currently running ([abd5baa](https://github.com/endojs/endo/commit/abd5baa9e795f9520387efd6000f5bc5dd8af0a7))
* **daemon:** Send message from guest to host, Host adopt and dismiss commands ([388d23a](https://github.com/endojs/endo/commit/388d23a6d5987e65ad611688538b0bc37a5355ef))
* **daemon:** store endo formula upon initialization ([dd0d64d](https://github.com/endojs/endo/commit/dd0d64d480188e51d6398a13cb3ef6a14f745e50))
* **daemon:** Support importBundle0 (confined) ([0492b61](https://github.com/endojs/endo/commit/0492b6190840919c25b7dd8294b6fc060383b473))
* **daemon:** Support importUnsafe0 ([5f05257](https://github.com/endojs/endo/commit/5f05257918fd7c26b268942d26fbc16250b452a9))
* **daemon:** Support termination DAG generally ([76ec7ea](https://github.com/endojs/endo/commit/76ec7ea6bb1328ea0f530571a8762c0e471911c0))
* **daemon:** Thread cancellation context into worklets ([8f6921a](https://github.com/endojs/endo/commit/8f6921ae9532ddf7bed12faa9ce5db1cacc3d8de))
* **daemon:** Thread ephemeral state path ([8802bb0](https://github.com/endojs/endo/commit/8802bb060d40eb8548898146d039bbdc85269636))
* **daemon:** Undeniable host INFO tool ([3c2d924](https://github.com/endojs/endo/commit/3c2d9247277491f47c83de0fee9511b6e8d9bff3))
* **daemon:** web-page endowments include all compatible window properties ([0491e07](https://github.com/endojs/endo/commit/0491e07edc2b46cc498a8b8793033639530e4e76))


### Bug Fixes

* Appease lint harder ([3eaba38](https://github.com/endojs/endo/commit/3eaba3818af7d9acdb1fbdb2cb353b18b8661ec4))
* **daemon:** Address off-by-nybble formula path error ([a3f0c24](https://github.com/endojs/endo/commit/a3f0c241aa83fba3e966e607d5331cc88c8adf5c))
* **daemon:** Better test teardown ([341fbab](https://github.com/endojs/endo/commit/341fbab5c8c1dcaaf8585ab20cd38de88b782c4e))
* **daemon:** Clarify types of server daemon powers ([89f6554](https://github.com/endojs/endo/commit/89f6554a8d720f7aea77980fef8cda0604723950))
* **daemon:** Classify read errors ([214fd11](https://github.com/endojs/endo/commit/214fd1190fcac941ee101f880b25d4caaf959245))
* **daemon:** correct getWebPageBundlerFormula args ([21b5750](https://github.com/endojs/endo/commit/21b5750211d0e5973dba6ca99b555ffbd46714f1))
* **daemon:** Correctly use worker formula number in incarnateEval ([93d022a](https://github.com/endojs/endo/commit/93d022a1f276e3e289eb26e718ce8e912998ae2c)), closes [#2074](https://github.com/endojs/endo/issues/2074)
* **daemon:** Create directories earlier ([c24c8af](https://github.com/endojs/endo/commit/c24c8afb2073495a151b6fa6b35219301d12190f))
* **daemon:** enhance types for mail ([51bfe84](https://github.com/endojs/endo/commit/51bfe84ed9b4b1b1f54a94acc311745cfcb48b0b))
* **daemon:** enhance types for pet-store ([5be3da2](https://github.com/endojs/endo/commit/5be3da218fcb05c3d25b1d99a3b07888fb51be0d))
* **daemon:** Ensure guest store and worker nonces are unique ([ff8d310](https://github.com/endojs/endo/commit/ff8d3102ac7f36b52f5c5ffa2ea02ebaeaf8ff68))
* **daemon:** Evidently there is a limit on the length of a domain socket path ([4aea6a3](https://github.com/endojs/endo/commit/4aea6a3b3647e9f7a43309f2b7942fd6ac2a5c94))
* **daemon:** Finish consolidating special names in host ([a0a9168](https://github.com/endojs/endo/commit/a0a9168d66e5263d63e94f267ca834cacf9d2beb))
* **daemon:** Fix bug in send test ([95a6e1e](https://github.com/endojs/endo/commit/95a6e1e8ed987a560abe8f476f6a0df0624f0bce))
* **daemon:** Fix length of zero512 constant ([89bc1e1](https://github.com/endojs/endo/commit/89bc1e1a1c53098a592409c8f4ef37b776400aa1))
* **daemon:** Fix locator type reference ([83b3be4](https://github.com/endojs/endo/commit/83b3be447363a032e3f3d2e003d8b07dac5d876e))
* **daemon:** Import order lint fix ([4a4ae54](https://github.com/endojs/endo/commit/4a4ae5497427e97fb41e51a44c27c13b4d0d4c26))
* **daemon:** in mail remove redundant SELF lookup ([fe3caf5](https://github.com/endojs/endo/commit/fe3caf554afb3baff4dff9d6dc24402281575ecd))
* **daemon:** Log to state, not cache ([aa69ea2](https://github.com/endojs/endo/commit/aa69ea2d99957c3d43731223930d1bc17e30e2ca))
* **daemon:** Loosen type for panic message ([2f8aa51](https://github.com/endojs/endo/commit/2f8aa51c97356327ca101af58a8c7aa8e74099cf))
* **daemon:** makeIdentifiedHost wrapped controller bug ([3f625c1](https://github.com/endojs/endo/commit/3f625c18e157a4e6b89ebbaf22f85a81635fbab7))
* **daemon:** Narrow type of window location for web page bootstrap ([a470ce6](https://github.com/endojs/endo/commit/a470ce6a0c3dd1c6c4484389a5229edf9820c08f))
* **daemon:** node makeFilePowers uses mutex for serial file updates ([ba1b33f](https://github.com/endojs/endo/commit/ba1b33f803f6ba3d0950fa75b607e870c7797b64))
* **daemon:** pet-store removes petname when overwriting with write ([6050df8](https://github.com/endojs/endo/commit/6050df83414152b344195c102d0e71cf1bde1a60))
* **daemon:** Private port started promise resolved early ([a45f693](https://github.com/endojs/endo/commit/a45f693579da3dbe65a0e1a7bc4d03f71b6e8ebf))
* **daemon:** Realign pet store and host types ([6d0bb32](https://github.com/endojs/endo/commit/6d0bb32a735a21213e75a383c92bdf08bd04488a))
* **daemon:** Relocate type reference for AsyncQueue ([29a9f5c](https://github.com/endojs/endo/commit/29a9f5c078910dc5b4c5cad2546049cf9e48a008))
* **daemon:** Remove and rename must adjust live memo ([de7959d](https://github.com/endojs/endo/commit/de7959da33d3b80e38710612fb95ef838a563be4))
* **daemon:** rename EndoBootstrap type to FarEndoBootstrap ([d643f0c](https://github.com/endojs/endo/commit/d643f0c9a0c7f4361d4440c2c775261d2d73e725))
* **daemon:** rename mail lookupFormulaIdentifierForName to identifyLocal ([fef70c3](https://github.com/endojs/endo/commit/fef70c344fa03a9f154911be04105b8831f71e24))
* **daemon:** rename petStore lookup to identifyLocal ([a3de821](https://github.com/endojs/endo/commit/a3de821fee85d8ef38aa0eef2e22dab3d6263cb1))
* **daemon:** Restore 128-bit formula numbers for web bundles ([e5d7082](https://github.com/endojs/endo/commit/e5d7082b934d19d0e86b1d2483db9346d7e59959))
* **daemon:** Stale comment re provide vs lookup ([3144c11](https://github.com/endojs/endo/commit/3144c116c2ed35996b57f6fe246ddb8a35150974))
* **daemon:** Support pet-inspector in parseFormulaIdentifier ([d0eaab1](https://github.com/endojs/endo/commit/d0eaab150d2accb3be7ef1ad21a6e48c49dd5ee0))
* **endo:** Synchronize host cancellation with formula graph ([8a52453](https://github.com/endojs/endo/commit/8a5245382bbcca46b45f560da26c248489c56f3e))
* Relax lint for optional chaining and nullish coallescing for daemon ([ff58c06](https://github.com/endojs/endo/commit/ff58c065130b774ccb3c9cddbb7562505f0e43a0))
* Resolve remaining merge issues ([d07b7df](https://github.com/endojs/endo/commit/d07b7dfa5513391e8716bdcb658ec9aa2a660fd6))
* Settle the readable types ([6716862](https://github.com/endojs/endo/commit/6716862fca6dee0ad685d163101f157fd66682b0))


### Code Refactoring

* **daemon:** Add recipient name argument to Guest request method, allowing HOST ([975f61e](https://github.com/endojs/endo/commit/975f61e974efa26e3f012be5572bf5fa33034d1f))
* **daemon:** Change unsafe import formula from path to specifier ([a0f141f](https://github.com/endojs/endo/commit/a0f141f20e059e9988d9117c066f23f1bcbff559))
* **daemon:** Despecify id512/sha512 in formula type ([bfc7c7f](https://github.com/endojs/endo/commit/bfc7c7f9139064d555a68fb93f951e80c7a59e95))
* **daemon:** Remove receive method ([21f5715](https://github.com/endojs/endo/commit/21f5715276743546a51ccee21765e0bbd57bdbf5))
* **daemon:** Rename lookup to reverseLookup ([264a200](https://github.com/endojs/endo/commit/264a200b6924be705aa39582b2b7c480b979ff25))



### [1.0.3](https://github.com/endojs/endo/compare/@endo/daemon@1.0.2...@endo/daemon@1.0.3) (2024-02-15)


### Bug Fixes

* Add repository directory to all package descriptors ([e5f36e7](https://github.com/endojs/endo/commit/e5f36e7a321c13ee25e74eb74d2a5f3d7517119c))



### [1.0.2](https://github.com/endojs/endo/compare/@endo/daemon@1.0.1...@endo/daemon@1.0.2) (2024-01-18)

**Note:** Version bump only for package @endo/daemon





### [1.0.1](https://github.com/endojs/endo/compare/@endo/daemon@1.0.0...@endo/daemon@1.0.1) (2023-12-20)

**Note:** Version bump only for package @endo/daemon





## [1.0.0](https://github.com/endojs/endo/compare/@endo/daemon@0.2.6...@endo/daemon@1.0.0) (2023-12-12)


### Bug Fixes

* Adjust type generation in release process and CI ([9465be3](https://github.com/endojs/endo/commit/9465be369e53167815ca444f6293a8e9eb48501d))
* enable compatibility with node16/nodenext module resolution ([9063c47](https://github.com/endojs/endo/commit/9063c47a2016a8ed3ae371646c7b81e47006a091))



### [0.2.6](https://github.com/endojs/endo/compare/@endo/daemon@0.2.5...@endo/daemon@0.2.6) (2023-09-12)

**Note:** Version bump only for package @endo/daemon





### [0.2.5](https://github.com/endojs/endo/compare/@endo/daemon@0.2.3...@endo/daemon@0.2.5) (2023-08-07)

**Note:** Version bump only for package @endo/daemon





### [0.2.4](https://github.com/endojs/endo/compare/@endo/daemon@0.2.3...@endo/daemon@0.2.4) (2023-08-07)

**Note:** Version bump only for package @endo/daemon





### [0.2.3](https://github.com/endojs/endo/compare/@endo/daemon@0.2.2...@endo/daemon@0.2.3) (2023-07-19)

**Note:** Version bump only for package @endo/daemon





### [0.2.2](https://github.com/endojs/endo/compare/@endo/daemon@0.2.1...@endo/daemon@0.2.2) (2023-04-20)

**Note:** Version bump only for package @endo/daemon

### [0.2.1](https://github.com/endojs/endo/compare/@endo/daemon@0.2.0...@endo/daemon@0.2.1) (2023-04-14)

**Note:** Version bump only for package @endo/daemon

## [0.2.0](https://github.com/endojs/endo/compare/@endo/daemon@0.1.24...@endo/daemon@0.2.0) (2023-03-07)

### ⚠ BREAKING CHANGES

- **where:** Thread OS info

### Bug Fixes

- Fix hackerone.com links in SECURITY.md ([#1472](https://github.com/endojs/endo/issues/1472)) ([389733d](https://github.com/endojs/endo/commit/389733dbc7a74992f909c38d27ea7e8e68623959))
- Improve typing information ([765d262](https://github.com/endojs/endo/commit/765d2625ee278608494f7e998bcd3a3ee8b845a4))
- **where:** Thread OS info ([b7c2441](https://github.com/endojs/endo/commit/b7c24412250b45984964156894efb72ef72ac3f6))

### [0.1.24](https://github.com/endojs/endo/compare/@endo/daemon@0.1.23...@endo/daemon@0.1.24) (2022-12-23)

### Features

- **daemon:** Respond to ping ([83b1d42](https://github.com/endojs/endo/commit/83b1d420ba28a8f70b3fa6bee59aea18db874e62))

### [0.1.23](https://github.com/endojs/endo/compare/@endo/daemon@0.1.22...@endo/daemon@0.1.23) (2022-11-14)

**Note:** Version bump only for package @endo/daemon

### [0.1.22](https://github.com/endojs/endo/compare/@endo/daemon@0.1.21...@endo/daemon@0.1.22) (2022-10-24)

**Note:** Version bump only for package @endo/daemon

### [0.1.21](https://github.com/endojs/endo/compare/@endo/daemon@0.1.20...@endo/daemon@0.1.21) (2022-10-19)

**Note:** Version bump only for package @endo/daemon

### [0.1.20](https://github.com/endojs/endo/compare/@endo/daemon@0.1.19...@endo/daemon@0.1.20) (2022-09-27)

**Note:** Version bump only for package @endo/daemon

### [0.1.19](https://github.com/endojs/endo/compare/@endo/daemon@0.1.18...@endo/daemon@0.1.19) (2022-09-14)

### Features

- **netstring:** Chunked mode for writer ([355a391](https://github.com/endojs/endo/commit/355a391eefc35a2efcc069eba459c0d8a09a61f8))

### [0.1.18](https://github.com/endojs/endo/compare/@endo/daemon@0.1.17...@endo/daemon@0.1.18) (2022-08-26)

**Note:** Version bump only for package @endo/daemon

### [0.1.17](https://github.com/endojs/endo/compare/@endo/daemon@0.1.16...@endo/daemon@0.1.17) (2022-08-26)

**Note:** Version bump only for package @endo/daemon

### [0.1.16](https://github.com/endojs/endo/compare/@endo/daemon@0.1.15...@endo/daemon@0.1.16) (2022-08-25)

**Note:** Version bump only for package @endo/daemon

### [0.1.15](https://github.com/endojs/endo/compare/@endo/daemon@0.1.14...@endo/daemon@0.1.15) (2022-08-23)

**Note:** Version bump only for package @endo/daemon

### [0.1.14](https://github.com/endojs/endo/compare/@endo/daemon@0.1.13...@endo/daemon@0.1.14) (2022-06-28)

### Bug Fixes

- **daemon:** avoid leaking in promise race ([219e49d](https://github.com/endojs/endo/commit/219e49dcdb61bddad9bb6ff8662aed38b6d89b8e))

### [0.1.13](https://github.com/endojs/endo/compare/@endo/daemon@0.1.12...@endo/daemon@0.1.13) (2022-06-11)

**Note:** Version bump only for package @endo/daemon

### [0.1.12](https://github.com/endojs/endo/compare/@endo/daemon@0.1.11...@endo/daemon@0.1.12) (2022-04-15)

**Note:** Version bump only for package @endo/daemon

### [0.1.11](https://github.com/endojs/endo/compare/@endo/daemon@0.1.10...@endo/daemon@0.1.11) (2022-04-14)

**Note:** Version bump only for package @endo/daemon

### [0.1.10](https://github.com/endojs/endo/compare/@endo/daemon@0.1.9...@endo/daemon@0.1.10) (2022-04-13)

### Bug Fixes

- Revert dud release ([c8a7101](https://github.com/endojs/endo/commit/c8a71017d8d7af10a97909c9da9c5c7e59aed939))

### [0.1.9](https://github.com/endojs/endo/compare/@endo/daemon@0.1.8...@endo/daemon@0.1.9) (2022-04-12)

**Note:** Version bump only for package @endo/daemon

### [0.1.8](https://github.com/endojs/endo/compare/@endo/daemon@0.1.7...@endo/daemon@0.1.8) (2022-03-07)

**Note:** Version bump only for package @endo/daemon

### [0.1.7](https://github.com/endojs/endo/compare/@endo/daemon@0.1.6...@endo/daemon@0.1.7) (2022-03-02)

**Note:** Version bump only for package @endo/daemon

### [0.1.6](https://github.com/endojs/endo/compare/@endo/daemon@0.1.5...@endo/daemon@0.1.6) (2022-02-20)

**Note:** Version bump only for package @endo/daemon

### [0.1.5](https://github.com/endojs/endo/compare/@endo/daemon@0.1.4...@endo/daemon@0.1.5) (2022-02-18)

### Features

- **daemon:** Add reset feature ([f615e15](https://github.com/endojs/endo/commit/f615e1511a06fb040d376c99b9fdebc11552b94e))
- **daemon:** Clarify endo worker/daemon log actor ([47f65b7](https://github.com/endojs/endo/commit/47f65b7cdce5e647f25951c119c6f06a9f9ecd73))
- **daemon:** Preliminary worker ([88e3bc0](https://github.com/endojs/endo/commit/88e3bc048637e089ca7078221cb5b7d1d42c4b64))

### Bug Fixes

- Address TypeScript recommendations ([2d1e1e0](https://github.com/endojs/endo/commit/2d1e1e0bdd385a514315be908c33b8f8eb157295))
- Make sure lint:type runs correctly in CI ([a520419](https://github.com/endojs/endo/commit/a52041931e72cb7b7e3e21dde39c099cc9f262b0))
- Unify TS version to ~4.2 ([5fb173c](https://github.com/endojs/endo/commit/5fb173c05c9427dca5adfe66298c004780e8b86c))
- **daemon:** Move init from lib to app ([7aaf1a0](https://github.com/endojs/endo/commit/7aaf1a07d2950b16f7202ecc1d281386ba812d67))

### [0.1.4](https://github.com/endojs/endo/compare/@endo/daemon@0.1.3...@endo/daemon@0.1.4) (2022-01-31)

**Note:** Version bump only for package @endo/daemon

### [0.1.3](https://github.com/endojs/endo/compare/@endo/daemon@0.1.2...@endo/daemon@0.1.3) (2022-01-27)

### Bug Fixes

- Publish all materials consistently ([#1021](https://github.com/endojs/endo/issues/1021)) ([a2c74d9](https://github.com/endojs/endo/commit/a2c74d9de68a325761d62e1b2187a117ef884571))

### [0.1.2](https://github.com/endojs/endo/compare/@endo/daemon@0.1.1...@endo/daemon@0.1.2) (2022-01-25)

**Note:** Version bump only for package @endo/daemon

### 0.1.1 (2022-01-23)

### Features

- **endo:** Initial implementation of daemon, cli, where ([91f0ba3](https://github.com/endojs/endo/commit/91f0ba33201ae00624c84fe8cc99e7928ac44fdf))
