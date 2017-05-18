# PogChamp
## What is it
PogChamp is a suite of algorithms which is designed to detect important moments in an online live stream. The initial development will revolve around twitch.tv streams. The twitch chat room is notorious for having higher activity and saying specific things when a highlight is or has occurred. The algorithm leverages this behavior and intends to automate the process of finding highlights that has been delegated to video editors.
## What technology is used
The current plan is to break the development into a couple different segments. Data collection and storage will be accomplished using Node.js that logs into the twitch.tv IRC server and stores the information in a Mongo database. The math will be prototyped in Mathematica and implemented (tentatively) in python using scipy, numpy, etc.
## What is this for
PogChamp is an Adrian Tinsley Program (ATP) Summer Grant project. I am working on this project under the supervision of my two wonderful mentors, Seikyung Jung and Vignon Oussa. Although I've had this idea since my sophomore year in high-school I was never able to implement it due to other responsibilities but thanks to the Office of Undergraduate Research and the ATP Grant I'm able to dedicate the entire summer to research and development of this program that matters so much to me.
