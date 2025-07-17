## [0.19.1](https://github.com/elizaos/autofun-monorepo/compare/v0.19.0...v0.19.1) (2025-07-17)


### Bug Fixes

* remove log ([0c253da](https://github.com/elizaos/autofun-monorepo/commit/0c253dac44e8c495c6b25de1ff82fb0c4ecac3cd))

# [0.19.0](https://github.com/elizaos/autofun-monorepo/compare/v0.18.0...v0.19.0) (2025-07-17)


### Features

* fix indexer ([0ed8a9d](https://github.com/elizaos/autofun-monorepo/commit/0ed8a9d64267dfa5d2cfa37f747a5e93d95483cd))

# [0.18.0](https://github.com/elizaos/autofun-monorepo/compare/v0.17.0...v0.18.0) (2025-07-16)


### Bug Fixes

* change naming convention of vanity generation ([ae864f1](https://github.com/elizaos/autofun-monorepo/commit/ae864f1c0e9de099283ca488c07b435f36ead867))
* changed the % sell component to a grid view ([af14483](https://github.com/elizaos/autofun-monorepo/commit/af14483c787812738cb382d8d8187ae0f9143db4))
* correct the indexes for legacy decoder ([66c01cf](https://github.com/elizaos/autofun-monorepo/commit/66c01cf0efaa5e6d7dcc1a70f22a85aea8091c08))
* correctly store the values of bondingcurvebalance ([73ed5df](https://github.com/elizaos/autofun-monorepo/commit/73ed5df712a009b193b7997eef9834eccc57ff5a))
* divide reverse lamports by lamports ([431c086](https://github.com/elizaos/autofun-monorepo/commit/431c086d0e56f10259f34b7c77dd0a4fd4875af8))
* fix build ([97f9226](https://github.com/elizaos/autofun-monorepo/commit/97f9226d69112c4f406a41cb096f51b93a9b987c))
* fixed 53 bits cap ([deaa90f](https://github.com/elizaos/autofun-monorepo/commit/deaa90f0c1c053fd24c320406bc5f023483b7b1a))
* fixed bonding curve decimals ([8ab70c0](https://github.com/elizaos/autofun-monorepo/commit/8ab70c05241b3600ca6e4522cd8b201fa074ea45))
* fixed bug where buy amount was bugging ([1ad6172](https://github.com/elizaos/autofun-monorepo/commit/1ad6172b17f0adf8da59025ad2cf3ad0456b0bfe))
* fixed date * 1000 ([a82e8ca](https://github.com/elizaos/autofun-monorepo/commit/a82e8ca4c277a4dd2b672604c5264fbcbb81bfc0))
* fixed smoll cachekey mistake from joey ([c369dec](https://github.com/elizaos/autofun-monorepo/commit/c369dec0b1af86c964f067b55cb77dba9252e9ff))
* fixed text going out of box when width gets smaller ([037f3ac](https://github.com/elizaos/autofun-monorepo/commit/037f3ac263b7b71c3f99d7cd29087a6163cb3d18))
* keep types, because mongodb will return them as string and we use the interface in other places in the code ([ab4f959](https://github.com/elizaos/autofun-monorepo/commit/ab4f959ab2208f1011b4a166259922972e926586))
* make sure auto doesn't refresh ([2531c1f](https://github.com/elizaos/autofun-monorepo/commit/2531c1f3131a44ffc7e38e1d7ff5760c0a0f01ac))
* make sure holders page doesn't crash on testnet ([07cfebb](https://github.com/elizaos/autofun-monorepo/commit/07cfebbe2106bc77ddd7c2ac5b2c2a7aa539ac6a))
* make sure to get correct tier key ([16e9202](https://github.com/elizaos/autofun-monorepo/commit/16e920277dd1e81e1be446b7404f11ad9fbe28f0))
* make sure to return an error if no image is locked or uploaded ([63000f3](https://github.com/elizaos/autofun-monorepo/commit/63000f39889b163763190c3e75c57c6cf3fcf139))
* make sure to use indexer chart when token is migrating ([47ee389](https://github.com/elizaos/autofun-monorepo/commit/47ee38925af6ee0b1bb9fee2ce85a77d249959ce))
* make sure video generation works ([956d470](https://github.com/elizaos/autofun-monorepo/commit/956d47055700ebf64d923896f6322806a1b13a82))
* make sure we use base58 in handleAuth, as expected in backend ([1ae0315](https://github.com/elizaos/autofun-monorepo/commit/1ae031510287a7708fa8cd828cdbb793a8fa8dc9))
* reset mint key pair on create token ([48d0f84](https://github.com/elizaos/autofun-monorepo/commit/48d0f847358fda915c3deef35e09bbac97106d1e))
* smol fixes ([e919455](https://github.com/elizaos/autofun-monorepo/commit/e919455a436011d76383463ca9c2d935aa24a8f6))


### Features

* add bonding status on token page ([153ff41](https://github.com/elizaos/autofun-monorepo/commit/153ff41a928064a8ed6635aef91ebb161ec6b3db))
* add create token to sidebar ([687b18a](https://github.com/elizaos/autofun-monorepo/commit/687b18a91f5c862509d28986fca86f1ce5b1811c))
* add custom calculation for bonding curve ([9440dba](https://github.com/elizaos/autofun-monorepo/commit/9440dbad99fc5d59068a87c660c2fd2cac4eb7c2))
* add migration to populateTokensWithLiveData ([171cc27](https://github.com/elizaos/autofun-monorepo/commit/171cc279794f440f814edbe11ea738554cde87e9))
* add warning when choosing 0 for trade limit ([a44d664](https://github.com/elizaos/autofun-monorepo/commit/a44d6647baa1f07083f8fb05635884a4b8207ef3))
* added image sharing between auto and manual ([1c13f09](https://github.com/elizaos/autofun-monorepo/commit/1c13f097a2b4ed441b89c6023b3328d95fd22d25))
* added migrating support to frontend ([fc226a7](https://github.com/elizaos/autofun-monorepo/commit/fc226a7963d0e1ea56bc70e425c53914fa74754b))
* attempt to fix auth for prod ([c0120e2](https://github.com/elizaos/autofun-monorepo/commit/c0120e2781c3c00c3ec7b5833d3e90401c675e9f))
* capitalization consistency ([6e0dada](https://github.com/elizaos/autofun-monorepo/commit/6e0dada7e349d3d10e92b873366f5a951387a93c))
* change button order ([4f1da2c](https://github.com/elizaos/autofun-monorepo/commit/4f1da2c292fc4b1b0482beba9a1f1de4cac92df4))
* change chat placeholder ([902a0be](https://github.com/elizaos/autofun-monorepo/commit/902a0be1016847f8a66c0c8e80612a6737fae277))
* change executeSwap ([519e844](https://github.com/elizaos/autofun-monorepo/commit/519e844d038b50d33ce3fc3d0007752600b137b6))
* enable dragging at manual creation ([7a5d407](https://github.com/elizaos/autofun-monorepo/commit/7a5d407fc9e7999a30d5099386d133c06337745e))
* fix auth on the frontend ([9682642](https://github.com/elizaos/autofun-monorepo/commit/96826428599f490923d2e36f106d7ceee616e8e5))
* legacy indexer implemented ([d392f10](https://github.com/elizaos/autofun-monorepo/commit/d392f101a1b301bb7d6622902ad5e1edf92c8469))
* make accordion clickable ([0aeb17d](https://github.com/elizaos/autofun-monorepo/commit/0aeb17d012b9169fd7914c3ece9461284af2e6a8))
* make media generation work on devnet ([e2aaf70](https://github.com/elizaos/autofun-monorepo/commit/e2aaf7099cac3e8b61ebbedc519afc3b3ffba960))
* make sure chats work on devnet ([2883d0e](https://github.com/elizaos/autofun-monorepo/commit/2883d0e4a01017534857554a3e21475f729b4082))
* make sure filters doesn't overflow sidebar ([8dc9aab](https://github.com/elizaos/autofun-monorepo/commit/8dc9aabeb4683d406d7a303dfa4d3fb400d66b1e))
* make sure the authentication middleware works well ([0acaca7](https://github.com/elizaos/autofun-monorepo/commit/0acaca7ed6d7d038f4ffa82e6a49bce3445e9ea2))
* make sure to catch failed creates with indexer ([f5273fa](https://github.com/elizaos/autofun-monorepo/commit/f5273fa7c62f860d5228ae62e3a0758cc3b28edd))
* make sure vanity generating can be canceled ([266a190](https://github.com/elizaos/autofun-monorepo/commit/266a190ee906f97acefb6c11c70b8be558fcda95))
* make sure you log out if not connected ([083fb5e](https://github.com/elizaos/autofun-monorepo/commit/083fb5e9dfab7c10f1249369c3fd1f059be69836))
* maxBlock for v2 and legacy ([5a0c166](https://github.com/elizaos/autofun-monorepo/commit/5a0c166e6e0e24b68e7c24847288902111f22dc6))
* prevent being able to unselect all pools ([e957cc3](https://github.com/elizaos/autofun-monorepo/commit/e957cc3f40759fd2bdb62e1ca6003cd3f7d2b039))
* prevent unselecting and make color more pronounced ([0dea298](https://github.com/elizaos/autofun-monorepo/commit/0dea2987669a32a744c258008ee20a9054f5690f))
* remove 3 percent when clicking max from balance ([9589aa9](https://github.com/elizaos/autofun-monorepo/commit/9589aa9a7fe4f5a6941082c7e18ed38cdfb07844))
* remove curveCompletion from indexer ([8c2dae2](https://github.com/elizaos/autofun-monorepo/commit/8c2dae2ee8ca06250ed2c35e12f06a034b8b87cf))
* remove sol balance in sidebar if closed ([9d5e856](https://github.com/elizaos/autofun-monorepo/commit/9d5e856b0b10ec4bb39affe1a174acf1ca564cdb))
* removed get user in its entirety ([20378d1](https://github.com/elizaos/autofun-monorepo/commit/20378d11f01f5dd08281f2199ab97240813f7f75))
* show proper countdown for when trading starts ([6511cf3](https://github.com/elizaos/autofun-monorepo/commit/6511cf3d21964917c69a640f72593bd7a803fc2e))
* ssr for ai-create ([cb4adeb](https://github.com/elizaos/autofun-monorepo/commit/cb4adebcab9b42b8c34d584fdeb25c514403153a))
* transaction listener context ([5c55692](https://github.com/elizaos/autofun-monorepo/commit/5c5569267cbf179840011d7bf30a42b885342794))
* transaction listener finished ([7ce78bb](https://github.com/elizaos/autofun-monorepo/commit/7ce78bb374f96494ffca7983189160fae7ce8756))
* upload files as png not webpo ([d1ef14c](https://github.com/elizaos/autofun-monorepo/commit/d1ef14c04ac4eefc33cc9a126afea93236c041c5))
* use fixed width in header ([187d91b](https://github.com/elizaos/autofun-monorepo/commit/187d91bf09f08c4cd32f7e2883eb3108aa7f740e))
* use same icon size ([8e8b182](https://github.com/elizaos/autofun-monorepo/commit/8e8b18211d1fc53825b0cedf285f81513cf2a2fd))

# [0.17.0](https://github.com/elizaos/autofun-monorepo/compare/v0.16.1...v0.17.0) (2025-06-20)


### Bug Fixes

* highlight current tab ([3552475](https://github.com/elizaos/autofun-monorepo/commit/35524757495eea6f6c4f500fe386bda211d5217a))
* make sure connect button doesn't overflow on sidemenu collapse ([189ac54](https://github.com/elizaos/autofun-monorepo/commit/189ac5413984e3b47c84c79aa6a54bb0e5bb8200))
* make sure sidebar doesn't break page height ([52756f3](https://github.com/elizaos/autofun-monorepo/commit/52756f339f4e07616f688fcf75754bf375ee0da1))
* remove green text on button hover ([abe6f0c](https://github.com/elizaos/autofun-monorepo/commit/abe6f0c9395a444bf8fe6535da47b5e286625fee))
* stop generating media if fail on media ([0dd0eb2](https://github.com/elizaos/autofun-monorepo/commit/0dd0eb2c49ccde984de737be400c9aad291bee63))


### Features

* add mandatory token balance to chat ([3807b9f](https://github.com/elizaos/autofun-monorepo/commit/3807b9fcdab77975208a264b1ab7612518db7fb0))
* add min amout of tokens for generation ([8389a1a](https://github.com/elizaos/autofun-monorepo/commit/8389a1a785a5fc9a9e11da3781b0044c0fdd6dda))
* add slider for speeds ([ece0353](https://github.com/elizaos/autofun-monorepo/commit/ece0353e379181efbc997348401719c014c6bbc4))
* change back to og authentication middleware ([4499612](https://github.com/elizaos/autofun-monorepo/commit/4499612f718f67ef868134a5ea0de3b25e819cc2))
* chat almost done ([4f4babe](https://github.com/elizaos/autofun-monorepo/commit/4f4babe9e09f27297b9b5185d5ec047b3653d775))
* disable button if not enough tokens ([f3c6589](https://github.com/elizaos/autofun-monorepo/commit/f3c65897d40199f111367ffd4ba09719999108e9))
* full screen for images and videos ([77c5a4f](https://github.com/elizaos/autofun-monorepo/commit/77c5a4fd3b0875c37f60d802ef73fa7f9f2afed6))
* make sure that the header is responsive ([396ff97](https://github.com/elizaos/autofun-monorepo/commit/396ff97d903c1060b66d80dcf840d7c727535c5f))
* set back default authentication ([c0f4c83](https://github.com/elizaos/autofun-monorepo/commit/c0f4c83474791af577086cd8d266bafa0ccf5244))
* ui tweaks and disable if not enough tokens ([7573582](https://github.com/elizaos/autofun-monorepo/commit/7573582791f4b2d48fc3645a803c271fee014953))
* update env.example ([192877d](https://github.com/elizaos/autofun-monorepo/commit/192877d5f0bb62fff58d07694fd7bdaa2de1485c))

## [0.16.1](https://github.com/elizaos/autofun-monorepo/compare/v0.16.0...v0.16.1) (2025-06-18)


### Bug Fixes

* fix build errors ([d32bc4a](https://github.com/elizaos/autofun-monorepo/commit/d32bc4a8570b0bcb807a83bf8aeba35c34f5ed29))

# [0.16.0](https://github.com/elizaos/autofun-monorepo/compare/v0.15.0...v0.16.0) (2025-06-18)


### Features

* capability for audio and video ([370055d](https://github.com/elizaos/autofun-monorepo/commit/370055d2c32ee3cff48533ce248d3210ce1fb0ab))
* delete images and download images, also audio and video ([e8c1110](https://github.com/elizaos/autofun-monorepo/commit/e8c1110d80c5e797b0db48e0e7a57e4ce11522c7))
* fix token creation ([211703a](https://github.com/elizaos/autofun-monorepo/commit/211703a588cce814a4d447781af94514a42b3deb))
* functional page ([d1bfc4b](https://github.com/elizaos/autofun-monorepo/commit/d1bfc4bd530f2437bc89ef1250b43c1cc02f8f58))
* timeout increase, audio and video components completely working ([fb382ec](https://github.com/elizaos/autofun-monorepo/commit/fb382ecd6c5eb30467269043fa67f6c20a32b542))
* updated footer pages and header bg color ([588a8da](https://github.com/elizaos/autofun-monorepo/commit/588a8dac585263ebddddd4f35701b22d30064bf4))
* updated lookup24hvolume to factor in the direction ([04c3962](https://github.com/elizaos/autofun-monorepo/commit/04c396276fd9a2291b7562fd55b93bb7ccf0870d))

# [0.15.0](https://github.com/elizaos/autofun-monorepo/compare/v0.14.0...v0.15.0) (2025-06-17)


### Bug Fixes

* align layout in center ([aeabe71](https://github.com/elizaos/autofun-monorepo/commit/aeabe710dc719b21dd139be6136eb1d30914f7f4))
* fixed deps ([643663a](https://github.com/elizaos/autofun-monorepo/commit/643663a3793dbc7184882094ff4a8fd3aceaf1ed))
* lint ([c5638ca](https://github.com/elizaos/autofun-monorepo/commit/c5638ca58506f83a71be2e27e9a25e67ef5968d6))


### Features

* add withdraw to schema ([c901c6d](https://github.com/elizaos/autofun-monorepo/commit/c901c6dfe0b0b3d13dbebcb2f323c122927d7673))
* added withdraw event ([75bb33f](https://github.com/elizaos/autofun-monorepo/commit/75bb33f05528dd21f654806050d3c03784d60620))
* assign /create to the new design ([53051e7](https://github.com/elizaos/autofun-monorepo/commit/53051e7fc5021f7a8f0a8612a194ab981ae30482))
* auto token generation ([04be911](https://github.com/elizaos/autofun-monorepo/commit/04be9114023cc84a7a0dd56df639c5efa67b49d2))
* correct sol for the custom curve ([59fef89](https://github.com/elizaos/autofun-monorepo/commit/59fef89f48ce494e2b001855c8ef9e5727457ffb))
* create token page almost done ([04d86b0](https://github.com/elizaos/autofun-monorepo/commit/04d86b0bd19035c98247ee676f210fb9524efc53))
* manual and import token ([1c2e923](https://github.com/elizaos/autofun-monorepo/commit/1c2e9234b87dbad865dff40da77ccc0c5cfb6c9b))
* more updates to homepage grid ([cc21601](https://github.com/elizaos/autofun-monorepo/commit/cc21601b21c95ac77193da544368018e0bb2bd33))
* put back footer ([067bcc9](https://github.com/elizaos/autofun-monorepo/commit/067bcc9a3aeeb96df0e292b605e228597fc810b5))
* reworked footer and container ([d404f88](https://github.com/elizaos/autofun-monorepo/commit/d404f885c7177993c8377d7a4ff43aaa8fde295d))
* sidebar is now aligned to the right ([3566d4b](https://github.com/elizaos/autofun-monorepo/commit/3566d4b5cf281a0c426c0595af7a570a5c8abdb7))
* small changes to grid ([4609454](https://github.com/elizaos/autofun-monorepo/commit/460945450030757359e47ceebda0aa73895af3e0))
* some more work on sidebar ([642639b](https://github.com/elizaos/autofun-monorepo/commit/642639b77954db6fc804a60bd166a99fe03b0edc))
* styled chart ([c02be54](https://github.com/elizaos/autofun-monorepo/commit/c02be547949f61a6966d270556eae70faa0d853c))
* updated input ([deba158](https://github.com/elizaos/autofun-monorepo/commit/deba1589ae2fb512a9d26acc04afabbe934b7fd8))
* very initial empty sidebar ([4769631](https://github.com/elizaos/autofun-monorepo/commit/4769631dafe5a5465889a47ab87728dce4faa8a3))
* work in progress on sidebar ([fb25c8f](https://github.com/elizaos/autofun-monorepo/commit/fb25c8f2921434df0dcb0f29d2244dc7fdc4d6ef))

# [0.14.0](https://github.com/elizaos/autofun-monorepo/compare/v0.13.0...v0.14.0) (2025-06-11)


### Bug Fixes

* dont create 2 queryclientprovider instances ([dbb3041](https://github.com/elizaos/autofun-monorepo/commit/dbb3041fb839da8519f7bf71bba228e95d6f0987))
* fixed broken route ([31b0aa9](https://github.com/elizaos/autofun-monorepo/commit/31b0aa95a3a0646fe79ccb955dc419109152b622))
* ported create token to new system ([2d65d08](https://github.com/elizaos/autofun-monorepo/commit/2d65d08dc0eb28609f59a024fd99fa86fbe72cb3))
* uncomment markGenesisSync ([845826f](https://github.com/elizaos/autofun-monorepo/commit/845826f12b287d8a395609d15c53d828c610f317))


### Features

* fixed indexer ([9f69d9c](https://github.com/elizaos/autofun-monorepo/commit/9f69d9ce91d2a507086f0c7d72ce87d4e895da27))

# [0.13.0](https://github.com/elizaos/autofun-monorepo/compare/v0.12.0...v0.13.0) (2025-06-09)


### Bug Fixes

* fixed agents ([3d8e013](https://github.com/elizaos/autofun-monorepo/commit/3d8e01305021cc2f9a8df678a083c2b923d1c617))
* fixed an issue ([17961e3](https://github.com/elizaos/autofun-monorepo/commit/17961e37d043e71ddc162e04302594d3f38f5402))
* fixed lint errors ([2c68f8c](https://github.com/elizaos/autofun-monorepo/commit/2c68f8ce9c3e78072554259458ff2074caa73e99))
* make sure direction is 0 or 1 ([6ebbb2b](https://github.com/elizaos/autofun-monorepo/commit/6ebbb2b736f12c4ddda3e53c88e94dfe8339a2f3))
* reinitialize chart container dimensions ([4780479](https://github.com/elizaos/autofun-monorepo/commit/478047974f03c57f908d2147c59ba07b47c1d2fd))
* remove tests from chart data endpoint ([548d0b6](https://github.com/elizaos/autofun-monorepo/commit/548d0b65bf770a89c3efcfdd989ad3956a2e7ebf))


### Features

* add differentiation between chart types ([0e8e5c7](https://github.com/elizaos/autofun-monorepo/commit/0e8e5c75bd49a4b5fd3d61551e2471f39696cf66))
* add new backups ([9d593cc](https://github.com/elizaos/autofun-monorepo/commit/9d593cca7250c56b43d59f9d8e1673761dd15fc0))
* added 24h volume from events ([613c521](https://github.com/elizaos/autofun-monorepo/commit/613c5213605c60198041fda6e51c36e1328b681c))
* added correct index ([516fc67](https://github.com/elizaos/autofun-monorepo/commit/516fc677e8668ecd58c60792fa85c909dee3300f))
* added transaction confirmer ([4ccac2e](https://github.com/elizaos/autofun-monorepo/commit/4ccac2ec78c16f4c41fa3f09ad621c0640715589))
* crypto prices can be cached for 2 minutes ([aedac39](https://github.com/elizaos/autofun-monorepo/commit/aedac396bcb23d428b76e53e1cb25d43865c530d))
* decrease concurrencyLimit ([de5cefa](https://github.com/elizaos/autofun-monorepo/commit/de5cefaf031fc21681fd77384256af881890638d))
* dont always run indexer ([cee5f70](https://github.com/elizaos/autofun-monorepo/commit/cee5f70f3bcf0ecc0d82715e1dc48a7ea6d63691))
* fix chart ([045224f](https://github.com/elizaos/autofun-monorepo/commit/045224f916d7c28b5c03ca42a75410be55145c71))
* fixed indexer ([8a1cbd2](https://github.com/elizaos/autofun-monorepo/commit/8a1cbd2838e32c6a370f410bdc6f36b597af2d70))
* invalidate both the balance and trades ([89fda56](https://github.com/elizaos/autofun-monorepo/commit/89fda56b367bfb340078e4c76659be24fd115b30))
* reworked populate live tokens in its entirety ([ac22ec2](https://github.com/elizaos/autofun-monorepo/commit/ac22ec2b4f5ae98d9bb4ce69c1022d62050054ad))

# [0.12.0](https://github.com/elizaos/autofun-monorepo/compare/v0.11.0...v0.12.0) (2025-06-05)


### Features

* set node_env ([476fbe2](https://github.com/elizaos/autofun-monorepo/commit/476fbe25b46b14d9cad0220197936c044e019124))

# [0.11.0](https://github.com/elizaos/autofun-monorepo/compare/v0.10.0...v0.11.0) (2025-06-05)


### Features

* indexer now actually can be built ([13ac124](https://github.com/elizaos/autofun-monorepo/commit/13ac1242a4cd4bb4e1f462bf63be19ed879f6a13))

# [0.10.0](https://github.com/elizaos/autofun-monorepo/compare/v0.9.0...v0.10.0) (2025-06-05)


### Bug Fixes

* fixed all lint issues ([02ab7f4](https://github.com/elizaos/autofun-monorepo/commit/02ab7f466e572fbdde6181378a13d6ea9760994a))


### Features

* added start script ([272ebed](https://github.com/elizaos/autofun-monorepo/commit/272ebedef4d33b2ad2dde84deebef73959d12c81))
* finish solana indexer ([f3b9323](https://github.com/elizaos/autofun-monorepo/commit/f3b93239667f0c263d8b0f95dafaf3464b6e0aa3))
* made all borders less round ([a2757f9](https://github.com/elizaos/autofun-monorepo/commit/a2757f9dec99775cf852a928a3caea8dc642c954))

# [0.9.0](https://github.com/elizaos/autofun-monorepo/compare/v0.8.0...v0.9.0) (2025-06-04)


### Features

* resolve bn improt ([3c341cf](https://github.com/elizaos/autofun-monorepo/commit/3c341cf3870b6e83cdf6671946cd4a1b6a7b728d))

# [0.8.0](https://github.com/elizaos/autofun-monorepo/compare/v0.7.0...v0.8.0) (2025-06-04)


### Bug Fixes

* fixed an issue where bondingcurvebalance was saved as BN ([c5c127e](https://github.com/elizaos/autofun-monorepo/commit/c5c127ee8f873181ee218aaf66c8ca0dd19ae0fa))
* fixed responsiveness ([ee9e694](https://github.com/elizaos/autofun-monorepo/commit/ee9e694f7472f10bba18a28fe6d36d00a805a733))
* fixed some responseiveness issues on holders table ([7fc20e5](https://github.com/elizaos/autofun-monorepo/commit/7fc20e5dc9779d4bc2fc9c8ea12d6b4fa69cb33b))
* removel og ([9eb2764](https://github.com/elizaos/autofun-monorepo/commit/9eb2764febd1249ad84d554a9ec06bc826572215))


### Features

* about-to-bond now works as expected ([2d72481](https://github.com/elizaos/autofun-monorepo/commit/2d7248144153bf664243c4efb296d491f4130034))
* added border highlight on hover ([b9cc291](https://github.com/elizaos/autofun-monorepo/commit/b9cc291f43ee3e23a740a6fa67475050fdb0d293))
* added social icons to initial header ([6253c9f](https://github.com/elizaos/autofun-monorepo/commit/6253c9fa1165ef9cc5d9a183ebfa4b98bafea284))
* bottombar on mobile operational ([56fd2df](https://github.com/elizaos/autofun-monorepo/commit/56fd2df03b6528d007211531c17475315b45010f))
* created very initial mobile navigation ([c1664a0](https://github.com/elizaos/autofun-monorepo/commit/c1664a011b9503336c2f5423918534f90f77b2e2))
* dont show when imported ([730e800](https://github.com/elizaos/autofun-monorepo/commit/730e800d9489bbef9496136183bd3e1f1afca280))
* dont use WalletContext for agents ([543863f](https://github.com/elizaos/autofun-monorepo/commit/543863fd562081455fff1c2f9765b27bd3fb9271))
* min received amount is now slightly animated ([a5095ba](https://github.com/elizaos/autofun-monorepo/commit/a5095bae2f163c5aa853aca78b9dc4d26339fe91))
* quick sell on mobile should scroll ([79384de](https://github.com/elizaos/autofun-monorepo/commit/79384deed6c28bb1048f49a4155c26c4df0454dc))
* remove chain indicator for now ([6ab96a7](https://github.com/elizaos/autofun-monorepo/commit/6ab96a7f1b5481de30418f686add479ecd893d9c))
* show toast after swap ([c2e2d6b](https://github.com/elizaos/autofun-monorepo/commit/c2e2d6bc865815e834b999a9065d3973c4461e48))
* the bondingCurveBalance is now a field that gets calculated in populateTokensLiveData ([0becaed](https://github.com/elizaos/autofun-monorepo/commit/0becaedef5d28200e9fe91750651028cc472f4f0))
* token page now has hybrid model of rendering ([a6de02f](https://github.com/elizaos/autofun-monorepo/commit/a6de02fca4bbd27ce7af309f94c1b65e876044a9))
* Trades are only animated now when they are new, aka after initial page view ([7088382](https://github.com/elizaos/autofun-monorepo/commit/70883826069d1b899da8cc7d218c055de9e5b74a))
* trades now refresh at a 15 second interval ([5427909](https://github.com/elizaos/autofun-monorepo/commit/5427909f8e77d3bd7292754e8b98501ff3aad470))

# [0.7.0](https://github.com/elizaos/autofun-monorepo/compare/v0.6.0...v0.7.0) (2025-06-04)


### Bug Fixes

* fixed an issue where chart was not loading for certain tokens ([0ad1d97](https://github.com/elizaos/autofun-monorepo/commit/0ad1d97a3f72cc32c05ad1acebcd0a2e16d8d34e))
* fixed an issue where curveCompleted was never set after the fact and not self healing ([6d91c60](https://github.com/elizaos/autofun-monorepo/commit/6d91c60d4b0a8ea2acfb3947c52e953b8706bb55))


### Features

* added command to start frontend standalone ([a0fb740](https://github.com/elizaos/autofun-monorepo/commit/a0fb740b11fb9102c05642aae6f523cbd5510e15))
* implemented simulation error from jupiter swaps ([30d938b](https://github.com/elizaos/autofun-monorepo/commit/30d938b752d569e5cba79b37020213c317789bee))
* jupiter swaps now possible and using fee amount ([097cb8a](https://github.com/elizaos/autofun-monorepo/commit/097cb8a9fcc153eeeb7bac7163a8b49c6d89e57d))
* menubar working for wallet ([5a4ba40](https://github.com/elizaos/autofun-monorepo/commit/5a4ba4029796d9a5f73c3d360e83f978d47685a3))
* some wip on swap on autofun program ([2c2b221](https://github.com/elizaos/autofun-monorepo/commit/2c2b2214bb40c114cab452668896dea1a07a756f))
* swap modal now properly checks for wallet connection ([a0a8fc3](https://github.com/elizaos/autofun-monorepo/commit/a0a8fc3fcfb6f7e99dcdc5cd0bfc3bfd934a82d7))
* swapping now works on autofun program ([d84e725](https://github.com/elizaos/autofun-monorepo/commit/d84e72503d217cc982eb807dd3e100d491701de6))
* tokenFee account is now working ([aeaea54](https://github.com/elizaos/autofun-monorepo/commit/aeaea54b69dfc3a3016c6be512ac3a03a517f927))

# [0.6.0](https://github.com/elizaos/autofun-monorepo/compare/v0.5.0...v0.6.0) (2025-06-03)


### Bug Fixes

* corrected some behaviour on sufficiency check ([312e7b1](https://github.com/elizaos/autofun-monorepo/commit/312e7b16719e973d976f9f783d5526c0e514af70))
* reset value if mode changes ([5c76ab7](https://github.com/elizaos/autofun-monorepo/commit/5c76ab7a73ebb5354fdb68472e025f5b3bfe9df4))


### Features

* added jupiter swap quote ([6728dc9](https://github.com/elizaos/autofun-monorepo/commit/6728dc9507ffd4152a6291a3d5ad42228a395b40))
* added todos ([2562dff](https://github.com/elizaos/autofun-monorepo/commit/2562dffc129870598ca61af992ef4a0a9849249c))
* almost there ([0d264d9](https://github.com/elizaos/autofun-monorepo/commit/0d264d9673340acd69a2d363c1b70ccf7cee4302))
* check properly for sufficient balance ([a38bd86](https://github.com/elizaos/autofun-monorepo/commit/a38bd8630784db79ee67294c15c4b495d821d822))
* cleanup slightly ([2216953](https://github.com/elizaos/autofun-monorepo/commit/22169533207e1782508ffc20911c938abe29c27b))
* fetching quote with jupiter for imported or curve completed tokens functional ([5177a91](https://github.com/elizaos/autofun-monorepo/commit/5177a917598681525442a81d0182386cbd722760))
* fixed an issue with search menu ([3dc9da5](https://github.com/elizaos/autofun-monorepo/commit/3dc9da5bf91df70cb09e8a09abc015f20238ccc3))
* header image is now responsive ([99224f1](https://github.com/elizaos/autofun-monorepo/commit/99224f10b7dc383e2b1c47f001e124828d9dd7a8))
* implemented price impact from jupiter properly ([17cb681](https://github.com/elizaos/autofun-monorepo/commit/17cb681eb59b1bcc82b41ae672b01269abd6bb4b))
* quote maker done ([0d2cdf3](https://github.com/elizaos/autofun-monorepo/commit/0d2cdf3f8f6289dc9fe0e21565c3a2445ef6a4d0))

# [0.5.0](https://github.com/elizaos/autofun-monorepo/compare/v0.4.0...v0.5.0) (2025-06-03)


### Features

* be able to run indexer as a standalone thing ([2e33d7e](https://github.com/elizaos/autofun-monorepo/commit/2e33d7e47b1415e08add1659a5b6371cebb6fadd))
* use newer lint ([1335d15](https://github.com/elizaos/autofun-monorepo/commit/1335d1564d40f7a6c680eb4161e5abde3140cb37))

# [0.4.0](https://github.com/elizaos/autofun-monorepo/compare/v0.3.0...v0.4.0) (2025-06-02)


### Features

* cors should be configurable ([08625e0](https://github.com/elizaos/autofun-monorepo/commit/08625e002f0339ccfdc7482da8e6404113c51a25))

# [0.3.0](https://github.com/elizaos/autofun-monorepo/compare/v0.2.0...v0.3.0) (2025-06-02)


### Bug Fixes

* added DSStore to gitignore ([83f9708](https://github.com/elizaos/autofun-monorepo/commit/83f97088121d25f17e93e75062c43b4bb94cb7fa))
* added missing cache to balances ([6d4e79f](https://github.com/elizaos/autofun-monorepo/commit/6d4e79f82c6fc6803894fc97da1843c5c6ac5cf2))
* dont show holder if balance is less than 1 token ([7d57b31](https://github.com/elizaos/autofun-monorepo/commit/7d57b315907b519239b4c17283d43c305dceaa00))
* ensure indexer lints for now ([1956b94](https://github.com/elizaos/autofun-monorepo/commit/1956b941f1ea323f4bad4e073d581846ab8ccb08))
* fixed broken active indicator for grid list selector ([2c29581](https://github.com/elizaos/autofun-monorepo/commit/2c2958174ff23f375f4051274ba6d74bc67412a3))
* fixed dotenv dependency ([4df1929](https://github.com/elizaos/autofun-monorepo/commit/4df1929d10646d32ee2a34e59cb89b1ef8f646d8))
* fixed duplicate token in route ([200c88c](https://github.com/elizaos/autofun-monorepo/commit/200c88c633f58006626f54ec9a479b13e1ca7a0b))
* fixed missing selector for lookup ([06afd04](https://github.com/elizaos/autofun-monorepo/commit/06afd049801f241641f088eb7764b2b29e35396d))
* fixed wrong import ([c536d08](https://github.com/elizaos/autofun-monorepo/commit/c536d08898a6a54717e95e2986fb728fdb77edc9))
* get correct swap PID and signer ([e62243b](https://github.com/elizaos/autofun-monorepo/commit/e62243baf4762b0ba88402bf63ffa13954caa11a))
* hide banner from chart ([7f17073](https://github.com/elizaos/autofun-monorepo/commit/7f170739db52fb845fe3c80b0d81a4f0da337a3d))
* link should not be clickable if none ([212bbb9](https://github.com/elizaos/autofun-monorepo/commit/212bbb9922cc4f73f376152df457987eb91cfed0))
* make sure id's are unique ([e1fc5f5](https://github.com/elizaos/autofun-monorepo/commit/e1fc5f57b115c47b0235ca3c90bd2e93ce6c951e))
* make the images fit better ([38d2d92](https://github.com/elizaos/autofun-monorepo/commit/38d2d926c321cd88d82c3a4b765a4586d9515816))
* prevent lock issues ([c48e04a](https://github.com/elizaos/autofun-monorepo/commit/c48e04aa2eb4f986155883aa815d082bd2bfa5d8))
* prevent token generation on manual page ([c818b9f](https://github.com/elizaos/autofun-monorepo/commit/c818b9fe6cd6a5aa7c2acfa96ee759cb84959b06))
* rebuild lockfile using pnpm 10 ([ca6415b](https://github.com/elizaos/autofun-monorepo/commit/ca6415b5be87c1ac41ff0d3882b23cb57c1fae5f))
* remove all lint issues ([986b429](https://github.com/elizaos/autofun-monorepo/commit/986b4296278d991ffeb53a3023a0d27dc3a2d1ef))
* remove dog-logger package ([1eaa6b4](https://github.com/elizaos/autofun-monorepo/commit/1eaa6b4b7e05dddffb789c98466d2a2c4041b2b1))
* remove duplicate txids that codex gives for some reason ([6e46532](https://github.com/elizaos/autofun-monorepo/commit/6e46532461da60a97fcb4e2d7a136d28c0915500))
* removed _id when populating data ([cd5dac5](https://github.com/elizaos/autofun-monorepo/commit/cd5dac51bfe40ca809933504bfd50a51045d21c0))
* removed DS_Store files caused by Mac ([e6e421a](https://github.com/elizaos/autofun-monorepo/commit/e6e421aa69716a2dc6b4d881cb4d03e0488b739c))
* resolve build error ([04f471d](https://github.com/elizaos/autofun-monorepo/commit/04f471ded4c17352711a9898f2d1f4b57ea623d7))
* resolved lint errors ([32584b9](https://github.com/elizaos/autofun-monorepo/commit/32584b99d000a895c3e7b11c5bd0bf17da4ca916))
* resolved lint issues so project builds ([96809b5](https://github.com/elizaos/autofun-monorepo/commit/96809b5773808a8c8a959222bf1fe4e8ce311972))
* some responsiveness fixes ([2ea8eb0](https://github.com/elizaos/autofun-monorepo/commit/2ea8eb05932d7c4d5b969fb9c41f5c883af5cbd0))
* type changes, styling changes, text changes ([83fd74a](https://github.com/elizaos/autofun-monorepo/commit/83fd74ab15ca108c5cbc774ec85a8a93b2284113))
* wait for finalized ([1334d3d](https://github.com/elizaos/autofun-monorepo/commit/1334d3d585dca7297cf32e463256cdb584f7f6b6))


### Features

*  useIsClient from use-hooks to prevent SSR ([0553659](https://github.com/elizaos/autofun-monorepo/commit/0553659f50f237ac0a9c4bc2ceb9ce4cbe0df661))
* add actual amount gotten of transaction ([f953476](https://github.com/elizaos/autofun-monorepo/commit/f9534765188c51ee9c744b40c7c865e48ed097c3))
* add back whether is creator of token or not ([9f96158](https://github.com/elizaos/autofun-monorepo/commit/9f961587abcba762c0c65844a1d4c240ef2d9e95))
* add config and abi ([3496d84](https://github.com/elizaos/autofun-monorepo/commit/3496d841350c98934b907a36bccdf2c00f21e5e4))
* add docker support ([18748aa](https://github.com/elizaos/autofun-monorepo/commit/18748aa6643bada58d3b5c6f3e6e89312d2e330e))
* add env to enable uploading to datadog ([f5e8655](https://github.com/elizaos/autofun-monorepo/commit/f5e8655cd698a7c8e1202e4d1a824b58c19429f2))
* add events meta backup ([3bdf0b0](https://github.com/elizaos/autofun-monorepo/commit/3bdf0b0bf11cf31657d42fbd1d50bce93766ad3d))
* add hamburger menu ([a9465c1](https://github.com/elizaos/autofun-monorepo/commit/a9465c1644288b0ed251b84b2fce73f40b09012b))
* add jwt ([f23830e](https://github.com/elizaos/autofun-monorepo/commit/f23830e9771f88c2154a3b603f44f567292ce2a4))
* add more persistence and remove old indexer ([ba8f364](https://github.com/elizaos/autofun-monorepo/commit/ba8f364333dfb94a718c9b8f1ed3136a9f695429))
* add sharp to dockerfile ([2553426](https://github.com/elizaos/autofun-monorepo/commit/25534264ef08ec244f1de34322913cee046f0e79))
* add trades endpoint for swaps and backup zip ([17847c2](https://github.com/elizaos/autofun-monorepo/commit/17847c2061bfad8c2b81ce6fb5464c1ea8e94457))
* add websocket to rpc package ([d69ceb9](https://github.com/elizaos/autofun-monorepo/commit/d69ceb917779113c1460506210497002a0fcac2c))
* added .env.example values and removed datadog and removed ai package ([f7528d1](https://github.com/elizaos/autofun-monorepo/commit/f7528d1ba414cf15b4502ef842bc4279902cf1c7))
* added autorefresher ([67927d2](https://github.com/elizaos/autofun-monorepo/commit/67927d297cf3ceb3ce6db52eb776193df8295a32))
* added backup ([a79a1f2](https://github.com/elizaos/autofun-monorepo/commit/a79a1f224162df9161df1c310a909a972b915b62))
* added balance dropdown ([5d079f9](https://github.com/elizaos/autofun-monorepo/commit/5d079f99faee3df3bcefd924427a34c9d1bb61f4))
* added caching to holders route ([09dc317](https://github.com/elizaos/autofun-monorepo/commit/09dc31770b77f8b1635f2e009002dfdea007f52d))
* added ChatMessage database schema ([ba3e1b8](https://github.com/elizaos/autofun-monorepo/commit/ba3e1b8fdbcc27da78fcc562b405787c1978aceb))
* added correct gradient ([2081df2](https://github.com/elizaos/autofun-monorepo/commit/2081df202cde5d84d5d6335a2fadd9698f495e0d))
* added correct icons to tabs ([758fec7](https://github.com/elizaos/autofun-monorepo/commit/758fec7d3ee9244535b387921656bf59560eccb1))
* added correct navigation to list view ([b0918e7](https://github.com/elizaos/autofun-monorepo/commit/b0918e7a72c1ef5376c52e10adccd885bcaa12a0))
* added description field ([de96072](https://github.com/elizaos/autofun-monorepo/commit/de960723b789077811a45a510123012f896b6b9f))
* added Dockerfile.backend and reworked Dockerfile.frontend ([861213e](https://github.com/elizaos/autofun-monorepo/commit/861213e98a312a602533a578bba240868ded6521))
* added evm tx lookup ([6f59a51](https://github.com/elizaos/autofun-monorepo/commit/6f59a5173c4728716ea203c10c9a179e20b15d57))
* added full searchbar functionality in frontend and backend and added correct indexes for it ([764694f](https://github.com/elizaos/autofun-monorepo/commit/764694f9ed650a4b55d41900b01176722aa5691c))
* added function to get block explorer dynamically per chain ([9c4acee](https://github.com/elizaos/autofun-monorepo/commit/9c4acee4792c3c19dc36757fe87d0e17151e81ee))
* added gaps ([f876e90](https://github.com/elizaos/autofun-monorepo/commit/f876e90279f5c3fadd287c9ec095a232a86122ef))
* added initial badges on holders list to give more info about certain holders ([c51b432](https://github.com/elizaos/autofun-monorepo/commit/c51b432fdfb5a5ff45f08ec4b66a7890e10a6303))
* added initial dummy buttons for chart and more ([18deeee](https://github.com/elizaos/autofun-monorepo/commit/18deeee2fee9ec6352cb3ccc4218d201460f79f1))
* added initial empty chat routes ([602668d](https://github.com/elizaos/autofun-monorepo/commit/602668d000fa74ec9b2b4fc155e5c229b9da7771))
* added initial holders table ([32513e0](https://github.com/elizaos/autofun-monorepo/commit/32513e0f807a1bd7d215332342c59a07778a9eda))
* added initial placeholder components to header ([7445867](https://github.com/elizaos/autofun-monorepo/commit/7445867b15600d74cbdf2b7cb9d062c712ecef6e))
* added initial profile page datga ([7cbb0b0](https://github.com/elizaos/autofun-monorepo/commit/7cbb0b0b1fc4bee82d7a86fc83eb4be2e7eff51f))
* added initial sorting options for tokens route ([ff7783d](https://github.com/elizaos/autofun-monorepo/commit/ff7783d2b3b405c945a671f630a3a706bad88ff7))
* added initial token info ([ced7d1b](https://github.com/elizaos/autofun-monorepo/commit/ced7d1b9abb2366be3fb211aba462874f4e590f8))
* added initial trades route ([0e0d21d](https://github.com/elizaos/autofun-monorepo/commit/0e0d21d02c2dccb7f102c401f07f430f3958eebb))
* added intial category filtering on homepage ([31a0978](https://github.com/elizaos/autofun-monorepo/commit/31a09787d8c371900081e4409319f8d946ac7a1b))
* added localstorage hook for speed ([e77c906](https://github.com/elizaos/autofun-monorepo/commit/e77c90644c0091218c7556a74eb14d52b1498c9a))
* added modal manager, modal context and wallet modal ([f7371b0](https://github.com/elizaos/autofun-monorepo/commit/f7371b021849674f4c14380fa83a3a2dbc95b19a))
* added more empty components ([f1f0cf1](https://github.com/elizaos/autofun-monorepo/commit/f1f0cf10a9e23848b343644dde56b16440ee1d14))
* added new triangle to trades table ([455a1f5](https://github.com/elizaos/autofun-monorepo/commit/455a1f59a24a2c33196c7cb06d97e66cda10ceee))
* added profile link ([387584f](https://github.com/elizaos/autofun-monorepo/commit/387584faaa5660a973904e02ccce5d687be7f84f))
* added progress bar on holders table as per figma desgins ([ef947c7](https://github.com/elizaos/autofun-monorepo/commit/ef947c76f6a7348b018377f3b59c8605c57902bf))
* added proper messaging for a too high slippage ([7bbdc65](https://github.com/elizaos/autofun-monorepo/commit/7bbdc65dfa14def1658a9c6673befbe9a4102765))
* added quick set sell buttons ([b94715c](https://github.com/elizaos/autofun-monorepo/commit/b94715c853017b06ee597c4daf0447503a7e3393))
* added route that gives back the last 100 messages in a chat room ([b44e074](https://github.com/elizaos/autofun-monorepo/commit/b44e074376a53e84355bced62042b91f9a604262))
* added route to get holders of token ([1447677](https://github.com/elizaos/autofun-monorepo/commit/1447677096dd6bc2e0d73f8c37967ba0ed78a101))
* added scam notice when a token has been hidden ([c0e53a1](https://github.com/elizaos/autofun-monorepo/commit/c0e53a14b1de39359edeb15306909e903472c2eb))
* added support for description in sync ([3eb5a66](https://github.com/elizaos/autofun-monorepo/commit/3eb5a6619664eadafb592a405ea05fdc12bdcd9a))
* added the data to the trades table ([cf6cc51](https://github.com/elizaos/autofun-monorepo/commit/cf6cc5128e789f2b0a98ec1dcd0a6af8f256e5c4))
* added tooltip to chain indicator ([f12a21a](https://github.com/elizaos/autofun-monorepo/commit/f12a21a49a52d8ce98f55f09b8a84e8e6583e8f2))
* added trades and holders dummy buttons ([6b5f5c6](https://github.com/elizaos/autofun-monorepo/commit/6b5f5c65c0fa3714d94583ac4e95aa5b724ebd09))
* added triangle to trades list ([e880b7d](https://github.com/elizaos/autofun-monorepo/commit/e880b7d172af775220159b55491b83b67207f953))
* added User database schema ([527de43](https://github.com/elizaos/autofun-monorepo/commit/527de4373769dbdc007ead4fa044c05517a7d3c0))
* also deploy frontend ([d47ee78](https://github.com/elizaos/autofun-monorepo/commit/d47ee78e4f123420b2639a8a32f3c398cb3b1976))
* batch processing for efficiency and insertmany ([6a9460f](https://github.com/elizaos/autofun-monorepo/commit/6a9460f50c26b5a90fc0108e4bc7b160d3baa492))
* building images should work on self-hosted machines ([718a4d3](https://github.com/elizaos/autofun-monorepo/commit/718a4d3383f97a1511aa6ab1af30cff44c2fea77))
* bunch of additions ([c07dcf3](https://github.com/elizaos/autofun-monorepo/commit/c07dcf35a9b66669cd9685b194bcd6c6747605d3))
* chat now checks for chain and chainid ([14c5ae6](https://github.com/elizaos/autofun-monorepo/commit/14c5ae6733703b46f54f37a3e008e73122c32246))
* chat now scrolls down properly as intended ([e0f6b3b](https://github.com/elizaos/autofun-monorepo/commit/e0f6b3b4e8a04432543bb0d8673bb63ea08b46ea))
* chat now uses redis to check if user is flooding ([018e4a1](https://github.com/elizaos/autofun-monorepo/commit/018e4a1583a39d748347aadfa5877c93fa162372))
* coingeckoterminal embed now works for all chains ([6e444cf](https://github.com/elizaos/autofun-monorepo/commit/6e444cfd10892f230fcc891a91f2546e058c7b4f))
* configured storybook, and created a test story ([cdb46df](https://github.com/elizaos/autofun-monorepo/commit/cdb46df6c76aa3dafb45d9ff642be7a21d1b6cca))
* correct advanced settings behaviour ([a11beb0](https://github.com/elizaos/autofun-monorepo/commit/a11beb03e15fa280c0e1ca1f5def0846de8bff6c))
* corrected and finalized chat design ([fc360c4](https://github.com/elizaos/autofun-monorepo/commit/fc360c4931c30cbca2db888a44633ef1b88666ce))
* corrected header ([37dd4bf](https://github.com/elizaos/autofun-monorepo/commit/37dd4bf735401a605bb7b10b4d55786980e60774))
* corrected some more styles ([8114f7d](https://github.com/elizaos/autofun-monorepo/commit/8114f7d12af838db6816592b9367a6abc4b9e847))
* created copy button and added it to list view ([7f29421](https://github.com/elizaos/autofun-monorepo/commit/7f294210d354bb143a1dfa5aca15b3d8e6e3d7b1))
* created hook to properly fetch crypto prices ([7f766d0](https://github.com/elizaos/autofun-monorepo/commit/7f766d0ecd788f196669691bece947d5bd1125bb))
* created initial balance getter hooks ([9947011](https://github.com/elizaos/autofun-monorepo/commit/994701179e0b95ab0dd156e4b9536758ae5e648b))
* created initial route to send messages, no checks for auth being done yet ([2ac0f22](https://github.com/elizaos/autofun-monorepo/commit/2ac0f224189fa3e2da71433dac11aad16101ea73))
* created mongoose document interface to get around type issues ([93409e1](https://github.com/elizaos/autofun-monorepo/commit/93409e1084947771110b50c162894915b679b3df))
* created unified checksum function ([353974d](https://github.com/elizaos/autofun-monorepo/commit/353974d941285bf8c3171e87807b225414d18416))
* creator wrapper function around all tabs of token page ([c1e9651](https://github.com/elizaos/autofun-monorepo/commit/c1e965158e364d16187a13dbedece82b4bd0de9d))
* disabled autocomplete ([3b6d2a1](https://github.com/elizaos/autofun-monorepo/commit/3b6d2a1026be66489ff263501723624e975174b3))
* Dockerfile.frontend created for production ([bdd984f](https://github.com/elizaos/autofun-monorepo/commit/bdd984fed466ced15d1a810ffbad474d43902493))
* dont build ai package ([eb5de90](https://github.com/elizaos/autofun-monorepo/commit/eb5de900d14496964088e63fc77b8973d45e31b8))
* dont show spinner on nprogress ([5891ac4](https://github.com/elizaos/autofun-monorepo/commit/5891ac48a94ac50edb28d9bece8d1255397e0a8f))
* ensure data redundancy ([860d3e2](https://github.com/elizaos/autofun-monorepo/commit/860d3e288406240f49395bb70d28e3a5839d1734))
* ensure time ago component does not get SSR'ed ([15f9893](https://github.com/elizaos/autofun-monorepo/commit/15f9893888c9f2719b3f06be90ba6bd0c903eca9))
* ensure token CA is under image ([32cd017](https://github.com/elizaos/autofun-monorepo/commit/32cd017a22650b8cf643044f9948b55df6df2470))
* finished initial list view ([a0710ec](https://github.com/elizaos/autofun-monorepo/commit/a0710ec94cb2c2507a074eb613276deb9fd97a26))
* host 0.0.0.0 ([0a29078](https://github.com/elizaos/autofun-monorepo/commit/0a29078ff9f995f73355b67005390cfdcfa8d9bc))
* image uploading works for chat ([a005fd3](https://github.com/elizaos/autofun-monorepo/commit/a005fd32da6073d9c7efcc1e87051f57c07bee55))
* immediately populate new data on import ([ad1f6a4](https://github.com/elizaos/autofun-monorepo/commit/ad1f6a4636e4ad78025ac8447c2ed33e20cceef2))
* implemented 404 page ([e3c7857](https://github.com/elizaos/autofun-monorepo/commit/e3c785744d4597528d76f1647dc89951d2628832))
* implemented localstorage on the the recent transactions ([4389ac2](https://github.com/elizaos/autofun-monorepo/commit/4389ac21e76664a2a18b6caab8cf00a4ea994de9))
* implemented sol chain on hook ([44eb537](https://github.com/elizaos/autofun-monorepo/commit/44eb537833efeb4225db83e187fd23c0f5978acb))
* improved grid more like figma ([0f0ba0b](https://github.com/elizaos/autofun-monorepo/commit/0f0ba0b2aae7448a91595ab4eb351b9dad8dd630))
* in holders route we now precalcuate all the frontend values before hand ([41412bf](https://github.com/elizaos/autofun-monorepo/commit/41412bfc5a7a32f50c633ad62a231d09dd46a85a))
* in progress implementing transaction hook ([8078e7e](https://github.com/elizaos/autofun-monorepo/commit/8078e7e6b487faa636f9c9a0e9b9e266a4fc7267))
* in progress transaction hook ([d15c715](https://github.com/elizaos/autofun-monorepo/commit/d15c715dd35a86a039b3e095f3c144aaf9d93a16))
* initial subsquid commit ([d9ec62a](https://github.com/elizaos/autofun-monorepo/commit/d9ec62acd4719a2327b39311fc197ac01d3873fc))
* initial work in progress on list view ([f1306a2](https://github.com/elizaos/autofun-monorepo/commit/f1306a2227a6dcb8a8ec39299cb197666402a0b5))
* made the token tabs more like the actual design ([38f700c](https://github.com/elizaos/autofun-monorepo/commit/38f700cea7e4f7aa87b65763728b9265efcbb6d2))
* more work in progress on chat ([62581cc](https://github.com/elizaos/autofun-monorepo/commit/62581cc4ffbea8fdbf5fd8505a4c05e65e064426))
* more work on swap component ([fe54030](https://github.com/elizaos/autofun-monorepo/commit/fe540306ea215bd78884ce20fd1b3306b9254bf0))
* new indexer ([2bb3714](https://github.com/elizaos/autofun-monorepo/commit/2bb37147d3347a29e7bd3bfea64479c2846e7492))
* NEXT_PUBLIC_API_URL ([c1aafe7](https://github.com/elizaos/autofun-monorepo/commit/c1aafe71c26f2b14d35d336e23f7fd06738187ff))
* no eslint check during build ([021e494](https://github.com/elizaos/autofun-monorepo/commit/021e4944d59efc3709e98819acf9640069ab5ab5))
* no pw ([34e1fac](https://github.com/elizaos/autofun-monorepo/commit/34e1facf0ab4b1c6d43bc8d7e1b93725c7f581d8))
* only show swaps that are 5$ or higher ([3236540](https://github.com/elizaos/autofun-monorepo/commit/32365408b0c0421e3343403d0b8e643981daee5e))
* only use codex if curve is completed and the token is not imported or if imported ([04bc554](https://github.com/elizaos/autofun-monorepo/commit/04bc554bbc4fd92f9e22cdec864fa1e686f293a0))
* persistance for indexer ([7752eb6](https://github.com/elizaos/autofun-monorepo/commit/7752eb69cc7e285b78e039bcaabb8edba1d8b71a))
* prettify message ([72a5828](https://github.com/elizaos/autofun-monorepo/commit/72a58283edc5b29a3b0ea69551d074e7dd6a2fd6))
* progressbar is now animated and more fluid and is a unified component ([a3eca81](https://github.com/elizaos/autofun-monorepo/commit/a3eca81980326a7de4bd3e50f3542bb6f9b52457))
* properly display total supply formatted ([210fa43](https://github.com/elizaos/autofun-monorepo/commit/210fa43ad82edb05dfab713b55d9e8540384fa1f))
* properly setvalue ([ea6abd9](https://github.com/elizaos/autofun-monorepo/commit/ea6abd941c61bd3fe773f85fbdb0c7e7b96cc121))
* properly show that there are no holders or trades if there is no data ([3072afd](https://github.com/elizaos/autofun-monorepo/commit/3072afd31d5bff3c8b34600b6febf1f7c77ccff9))
* rebuild ([73fa938](https://github.com/elizaos/autofun-monorepo/commit/73fa9380e6387be3c30c348bcb57db97483f39d0))
* rebuild on self-hosted ([b04b436](https://github.com/elizaos/autofun-monorepo/commit/b04b436419e1d71575c89e1c1f88648dae961d51))
* remove image onclick ([25b9fa0](https://github.com/elizaos/autofun-monorepo/commit/25b9fa062593ad66ab66c23f7dd0c5ca7ed351a2))
* removed _id ([d2d2515](https://github.com/elizaos/autofun-monorepo/commit/d2d2515054307818d9dad88ffc1b68f7b7397478))
* removed all rounded borders ([58fc1d9](https://github.com/elizaos/autofun-monorepo/commit/58fc1d9a581859634e0a896cc4f2a4baa9687cac))
* removed autorefresher as its causing issues ([0009c8a](https://github.com/elizaos/autofun-monorepo/commit/0009c8a639427f60ade8783d3dc822c5eaa1687a))
* resolved some responsiveness issues ([d27b055](https://github.com/elizaos/autofun-monorepo/commit/d27b0550820a27cf5c7e92915fc0db2e3eb98774))
* resolved type errors around chat room ([7176afe](https://github.com/elizaos/autofun-monorepo/commit/7176afe4fe647b0e99e8cdfc6593a4f777d62fed))
* return bondingCurveAddress ([36039da](https://github.com/elizaos/autofun-monorepo/commit/36039dad50cfa3de75536a87184c3998ad097177))
* reworked tooltip ([f71e2ef](https://github.com/elizaos/autofun-monorepo/commit/f71e2ef7925fff0b23458facd42f3d717a030917))
* show launching while launching, as well as balance update ([baf3de0](https://github.com/elizaos/autofun-monorepo/commit/baf3de0cee6717d29eee9c20dba92040e17ff09c))
* split out the recent transactions ([50111f7](https://github.com/elizaos/autofun-monorepo/commit/50111f701d00aba32af69b94847c1206cb8f1e5c))
* start bare indexer ([9409eec](https://github.com/elizaos/autofun-monorepo/commit/9409eec23ab5b5ece9322bc4213e6ec4a5c8cbd9))
* start calculating by account signature ([92afdea](https://github.com/elizaos/autofun-monorepo/commit/92afdea8d2c6e279b6a6cb31ce1ae6bd40217a32))
* styled tooltip ([eee8906](https://github.com/elizaos/autofun-monorepo/commit/eee8906e4ca8b22de3629811292a4131c2a4c7e4))
* swap component should have a buy and sell mode ([f946547](https://github.com/elizaos/autofun-monorepo/commit/f946547027e8a466dd1850a5d7a350509a88430c))
* swap function should factor in the slippage and speed ([1bd64d9](https://github.com/elizaos/autofun-monorepo/commit/1bd64d974215f850374b8f9e046def01a09990df))
* tabs are now exact same style as figma ([615e7d2](https://github.com/elizaos/autofun-monorepo/commit/615e7d236ca3945d63c4f7c1d3b1c205a0230e9b))
* token tabs route now fully functional ([27b6ecc](https://github.com/elizaos/autofun-monorepo/commit/27b6eccbab0938dbdf485a92a0613a554cc0ede2))
* trades no has live updating timer and holders list has correct link ([8714660](https://github.com/elizaos/autofun-monorepo/commit/8714660bb87b98142e3b49ea4912843bfd8be232))
* updated docker file ([1488c4c](https://github.com/elizaos/autofun-monorepo/commit/1488c4c5adadb657956fbf22b637d5c193e685de))
* updated Dockerfile ([5ab4ee3](https://github.com/elizaos/autofun-monorepo/commit/5ab4ee386b0a00fadfe5fd4410ed7616ddd39db6))
* updated dockerfile.backend ([9ac7256](https://github.com/elizaos/autofun-monorepo/commit/9ac7256c6831d227f2e7d19eb78ec639c9bef6ab))
* updated frontend docker file ([7350430](https://github.com/elizaos/autofun-monorepo/commit/73504309a9d3b8ac439d492eb37d03af016d71f0))
* updated progressbar ([75416bc](https://github.com/elizaos/autofun-monorepo/commit/75416bc0ead6ae25cf755e2d8fb048321d31c79a))
* updated scrollbar color ([d1ffe5f](https://github.com/elizaos/autofun-monorepo/commit/d1ffe5f92980853fc9f68a2cdaeb714ada50a520))
* updated tableg ([a695c89](https://github.com/elizaos/autofun-monorepo/commit/a695c893ffb870b45534991830a57ecac3af1154))
* updated top token page to new design ([b63a78b](https://github.com/elizaos/autofun-monorepo/commit/b63a78bfa16252b86de9732d7cfa572a9c02bc6b))
* use a more strict refetch interval ([b8df6cb](https://github.com/elizaos/autofun-monorepo/commit/b8df6cbc74ea38734f6c992dc51b279186650aab))
* use correct route ([cbe9216](https://github.com/elizaos/autofun-monorepo/commit/cbe92162fa24df66029fe77303ae1d2739a13de6))
* use selfhosted runner ([88e6b40](https://github.com/elizaos/autofun-monorepo/commit/88e6b40e196233488b5a2444f0161bbbb1f6cb80))
* use shadcn tooltip instead of react-tooltip ([0457b3d](https://github.com/elizaos/autofun-monorepo/commit/0457b3d7a3dac8586c67f2676238b333fecc2868))
* use-balance hook working for solana ([b536fb5](https://github.com/elizaos/autofun-monorepo/commit/b536fb5d5a3ad7259e9600153671c79e82a76560))
* useRouter from progressbar ([f3948aa](https://github.com/elizaos/autofun-monorepo/commit/f3948aa1930290494ccccc5e8f147389d201f0ed))
* useTokenBalance fully operational ([970569f](https://github.com/elizaos/autofun-monorepo/commit/970569f7d7db27ad9e20979821d382d2524c2e94))
* very early initial bonding curve progressbar ([0721044](https://github.com/elizaos/autofun-monorepo/commit/0721044d3076a37a729999de025226a9729be4b7))
* very initial chat operational ([e57d40e](https://github.com/elizaos/autofun-monorepo/commit/e57d40efb3e1d8e03adfe075dddcee258563e23e))
* websocket connection ([a8246ff](https://github.com/elizaos/autofun-monorepo/commit/a8246ffc07cc7ae6c6c6f23bb14416e94d6343da))
* wip chat ([a9bf8d1](https://github.com/elizaos/autofun-monorepo/commit/a9bf8d1f26ec66be2dc15acae8c49f56b1422476))
* work in progress on chat window ([2d8b435](https://github.com/elizaos/autofun-monorepo/commit/2d8b435ce7fdb963c44118c9660fee9de73c4cd2))
* work in progress on initial menubar that we can reuse everywhere ([97127db](https://github.com/elizaos/autofun-monorepo/commit/97127dbc38a508146c3ddffc772ed76a88e8826c))
* work in progress on reintegrating the swaps ([4117650](https://github.com/elizaos/autofun-monorepo/commit/4117650a256744e65af5e39abe780ee1daeaa37a))
* working log processing ([ddfe3e5](https://github.com/elizaos/autofun-monorepo/commit/ddfe3e57843e5b75b3e87f48618901eb6977c746))

# [0.2.0](https://github.com/elizaos/autofun-monorepo/compare/v0.1.1...v0.2.0) (2025-05-13)


### Features

* added staging to branches ([b30737d](https://github.com/elizaos/autofun-monorepo/commit/b30737dced06ae7bad834e8d3f4be5aa535e95ea))
* added staging to release GHA ([bfee61e](https://github.com/elizaos/autofun-monorepo/commit/bfee61e9905d01bac5ba6513929c8a02ff644333))
* created github action that validates the PR source ([68e573d](https://github.com/elizaos/autofun-monorepo/commit/68e573da30fdbc5b570e5163baebc98ada4f0010))

# [0.2.0-staging.2](https://github.com/elizaos/autofun-monorepo/compare/v0.2.0-staging.1...v0.2.0-staging.2) (2025-05-13)


### Features

* created github action that validates the PR source ([68e573d](https://github.com/elizaos/autofun-monorepo/commit/68e573da30fdbc5b570e5163baebc98ada4f0010))

# [0.2.0-staging.1](https://github.com/elizaos/autofun-monorepo/compare/v0.1.1...v0.2.0-staging.1) (2025-05-13)


### Features

* added staging to branches ([b30737d](https://github.com/elizaos/autofun-monorepo/commit/b30737dced06ae7bad834e8d3f4be5aa535e95ea))
* added staging to release GHA ([bfee61e](https://github.com/elizaos/autofun-monorepo/commit/bfee61e9905d01bac5ba6513929c8a02ff644333))

## [0.1.1](https://github.com/elizaos/autofun-monorepo/compare/v0.1.0...v0.1.1) (2025-05-13)


### Bug Fixes

* attempt to fix release ([0f8c671](https://github.com/elizaos/autofun-monorepo/commit/0f8c671748fb8806faa23803617e9f0811eb8ba8))
* ensure run ([c9ac0c9](https://github.com/elizaos/autofun-monorepo/commit/c9ac0c9c9975dbd85e6a08e29ba2a2523b76f0ed))
* fix release flow ([27aab03](https://github.com/elizaos/autofun-monorepo/commit/27aab033ff23e12722b5b486330979092ad0cd50))
* fix releases ([85b781b](https://github.com/elizaos/autofun-monorepo/commit/85b781b419e91f0362817db5d03819024c7a0cb5))
* format and test run ([d9f259a](https://github.com/elizaos/autofun-monorepo/commit/d9f259abd391db79e6fd23986925cf838ad674b0))
* no frozen lockfile ([fb3c769](https://github.com/elizaos/autofun-monorepo/commit/fb3c7696ae6527a3fd6b1e3ffe0737e6f3c52f34))
* only commit analyzer ([7488811](https://github.com/elizaos/autofun-monorepo/commit/748881181d6dddfc7a92fed6f2bcae1c24861352))
* only on push otherwise it doesnt get ([be2bf3d](https://github.com/elizaos/autofun-monorepo/commit/be2bf3dca905114a4a05cdcc6e28147d276a161e))
* remove check ([8c86a52](https://github.com/elizaos/autofun-monorepo/commit/8c86a52be5073a2b9e10510f4fc636f5cdf43c6f))
* rerun when anything changes ([f141830](https://github.com/elizaos/autofun-monorepo/commit/f141830ce461c4b68ef98f6fb4b5e4b7649ad053))
* use GH_TOKEN ([2bb1e10](https://github.com/elizaos/autofun-monorepo/commit/2bb1e109254e2e77c9d2959f7a720b9dbd0a5b84))
