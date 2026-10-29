# The iPhone app: Face ID, notifications, builds

**Face ID on iOS:** the app opens locked and locks again a minute after it goes to
the background; the key to your computer sits in the keychain behind Face ID, so
even an unlocked phone does not give it away; new work, commits and pull requests
ask for Face ID first; the app switcher shows a cover instead of your code.
Settings, Require Face ID turns it off. Expo Go cannot use Face ID (it falls back
to the passcode); a development build (`npx expo run:ios` on a Mac with Xcode, or
`eas build --profile development`) has the real thing.

**Notifications on the iPhone:** Settings, Notifications. When a piece of work
needs you (the agent ended with a question, or stopped) or is ready for review,
the phone gets a notification, also with Garry closed; tapping it opens the
work. The home screen shows the same at a glance. Garry on your computer sends
them through Expo's push service. For a company: `GARRY_PUSH=off` turns them off
for everyone, `GARRY_PUSH_URL` sends to a push relay of your own, and
`GARRY_PUSH_DETAIL=minimal` leaves project and work names out of them. Needs a
build of the app with an EAS project id (`eas init`); Expo Go and the simulator
cannot receive them.

TestFlight and App Store builds come from Expo's build service:
`eas build --platform ios --profile production`, then `eas submit --platform ios`
([`eas.json`](../garry-mobile/eas.json)). That needs an Expo account and an Apple
Developer account (99 USD a year, the same one that signs the Mac app). Until then
Expo Go runs the app. CI checks the app on every push: the
client against a real server, a typecheck, a full bundle, and its web build in
a phone-sized browser paired with a real server (`test:mobile`).
