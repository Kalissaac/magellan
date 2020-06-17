//
//  /$$      /$$                               /$$ /$$
//  | $$$    /$$$                              | $$| $$
//  | $$$$  /$$$$  /$$$$$$   /$$$$$$   /$$$$$$ | $$| $$  /$$$$$$  /$$$$$$$
//  | $$ $$/$$ $$ |____  $$ /$$__  $$ /$$__  $$| $$| $$ |____  $$| $$__  $$
//  | $$  $$$| $$  /$$$$$$$| $$  \ $$| $$$$$$$$| $$| $$  /$$$$$$$| $$  \ $$
//  | $$\  $ | $$ /$$__  $$| $$  | $$| $$_____/| $$| $$ /$$__  $$| $$  | $$
//  | $$ \/  | $$|  $$$$$$$|  $$$$$$$|  $$$$$$$| $$| $$|  $$$$$$$| $$  | $$
//  |__/     |__/ \_______/ \____  $$ \_______/|__/|__/ \_______/|__/  |__/
//                          /$$  \ $$
//                         |  $$$$$$/
//                          \______/
//
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.
//
'use strict'

//
// ///////////////////////////////////////////////////////////////////// //
// External modules

require('dotenv').config()
const {
  DISCORD_TOKEN,
  MAPKIT_KEYID,
  MAPKIT_TEAMID,
  IMGUR_EMAIL,
  IMGUR_PASSWORD,
  IMGUR_CLIENTID,
  DOMAIN
} = process.env
const fs = require('fs')
const MAPKIT_PRIVATEKEY = fs.readFileSync(`./AuthKey_${MAPKIT_KEYID}.p8`)

const jwt = require('jsonwebtoken')
const { sign } = require('jwa')('ES256')

const jsdom = require('jsdom')
const { JSDOM } = jsdom

const Discord = require('discord.js')
const client = new Discord.Client()

const fetch = require('node-fetch')
const imgur = require('imgur')
imgur.setCredentials(IMGUR_EMAIL, IMGUR_PASSWORD, IMGUR_CLIENTID)

//
// ///////////////////////////////////////////////////////////////////// //
// MapKit Route Generation

const generateToken = (authKey, keyId, teamId, ttl = 120 * 60) => {
  const payload = {
    iss: teamId,
    iat: Date.now() / 1000,
    exp: (Date.now() / 1000) + ttl
  }

  const header = {
    kid: keyId,
    typ: 'JWT',
    alg: 'ES256',
    origin: `https://${DOMAIN}/`
  }

  return jwt.sign(payload, authKey, { header })
}

const generateRoute = async (origin, destination) => {
  return new Promise((resolve, reject) => {
    /* eslint-disable no-new */
    new JSDOM(`
    <!DOCTYPE html>
    <html>
    <head>
    <meta charset="utf-8">
    
    <script src="https://cdn.apple-mapkit.com/mk/5.x.x/mapkit.js"></script>
    
    <style>
    #map {
        width: 100%;
        height: 900px;
    }
    </style>
    
    </head>
    
    <body>
    <div id="map"></div>
    </body>
    
    <script>    
    mapkit.init({
        authorizationCallback: function(done) {
            done("${generateToken(MAPKIT_PRIVATEKEY, MAPKIT_KEYID, MAPKIT_TEAMID)}")
        }
    })
  
    const directions = new mapkit.Directions()
    directions.route({
      origin: "${origin}",
      destination: "${destination}",
      transportType: mapkit.Directions.Transport.Automobile,
      requestsAlternateRoutes: false
    }, (error, data) => {
      if (error) window.onRouteFailed(error)
      else if (data.routes.length === 0) window.onRouteFailed("No directions found for the specified route! Try including more details such as city, state and zip code.")
      else window.onRouteFinalized(data.routes[0])
    })
    </script>`, {
      url: `https://${DOMAIN}/`,
      referrer: `https://${DOMAIN}/`,
      resources: 'usable',
      runScripts: 'dangerously',
      beforeParse (window) {
        window.matchMedia = () => ({
          addListener: () => ({})
        })
        window.HTMLCanvasElement = () => ({
          getContext: () => ({})
        })
        window.onRouteFinalized = (route) => {
          console.log('Route information recieved')
          resolve(route)
        }
        window.onRouteFailed = (error) => {
          console.error(error)
          reject(error)
        }
      }
    })
  })
}

//
// ///////////////////////////////////////////////////////////////////// //
// MapKit Snapshot Generation

if (typeof (Number.prototype.toRad) === 'undefined') {
  Number.prototype.toRad = function () { return this * Math.PI / 180 } // eslint-disable-line no-extend-native
}
if (typeof (Number.prototype.toDeg) === 'undefined') {
  Number.prototype.toDeg = function () { return this * (180 / Math.PI) } // eslint-disable-line no-extend-native
}

const calculateMapCenterForRoute = (polyline, route) => {
  const origin = polyline[0].split(',').map(x => parseFloat(x))
  const destination = polyline[polyline.length - 1].split(',').map(x => parseFloat(x))

  // Longitude difference
  const dLng = (destination[1] - origin[1]).toRad()

  // Convert to radians
  const lat1 = origin[0].toRad()
  const lat2 = destination[0].toRad()
  const lng1 = origin[1].toRad()

  var bX = Math.cos(lat2) * Math.cos(dLng)
  var bY = Math.cos(lat2) * Math.sin(dLng)
  var lat3 = Math.atan2(Math.sin(lat1) + Math.sin(lat2), Math.sqrt((Math.cos(lat1) + bX) * (Math.cos(lat1) + bX) + bY * bY))
  var lng3 = lng1 + Math.atan2(bY, Math.cos(lat1) + bX)

  // Return result
  const centerPoint = [lng3.toDeg(), lat3.toDeg()]

  return centerPoint.reverse().join(',')
}

// A comma-separated coordinate span that indicates the
// amount of the map to display around the maps center.
// The latitude must be in the range of (0, 90) ,
// and the longitude must be in the range (0, 180).
// The latitude and longitude delta parameters must
// be positive numbers; negative numbers are treated as 0.
const calculateMapSpanForRoute = (center, route) => {
  let span = [0, 0]
  center = center.split(',')
  const polyline = route.polyline.points
  let farthestLatitude
  let farthestLongitude
  const origin = polyline[0]
  const destination = polyline[polyline.length - 1]

  farthestLatitude = Math.abs(center[0] - origin.latitude)
  farthestLongitude = Math.abs(center[1] - origin.longitude)

  if (Math.abs(center[0] - destination.latitude) > farthestLatitude) farthestLatitude = Math.abs(center[0] - destination.latitude)
  if (Math.abs(center[1] - destination.longitude) > farthestLongitude) farthestLongitude = Math.abs(center[1] - destination.longitude)

  for (const point of polyline) {
    if (Math.abs(center[0] - point.latitude) > farthestLatitude) farthestLatitude = Math.abs(center[0] - point.latitude)
    if (Math.abs(center[1] - point.longitude) > farthestLongitude) farthestLongitude = Math.abs(center[1] - point.longitude)
  }

  // Add 10% of margin around the edges
  farthestLatitude *= 2.5
  farthestLongitude *= 2.5

  span = [farthestLatitude, farthestLongitude]

  return span.join(',')
}

const appleCompatibleUrlEncodingPleaseSendHelp = (unencodedObject) => {
  let encodedString = ''

  for (const key in unencodedObject) {
    let value = unencodedObject[key]
    if (value instanceof Object || value instanceof Array) {
      value = JSON.stringify(value)
      value = encodeURIComponent(value)
      encodedString += `&${key}=${value}`
    } else {
      value = encodeURIComponent(value)
      encodedString += `&${key}=${value}`
    }
  }

  encodedString = encodedString.substr(1) // Remove first "&" character from string

  return encodedString
}

const signRequest = params => {
  const snapshotPath = `/api/v1/snapshot?${params}`
  const completePath = `${snapshotPath}&teamId=${MAPKIT_TEAMID}&keyId=${MAPKIT_KEYID}`
  const signature = sign(completePath, MAPKIT_PRIVATEKEY)

  // Append the signature to the end of the request URL, and return.
  return `${completePath}&signature=${signature}`
}

//
// ///////////////////////////////////////////////////////////////////// //
// Discord

const showRouteInEmbed = async (route, embed) => {
  embed.setTitle(route.name + ' to ' + embed.fields[1].value)
  embed.setDescription('')
  embed.addField('Distance', Math.round((route.distance * 0.0006213712 + Number.EPSILON) * 100) / 100 + ' mi', true)
  embed.addField('Travel Time', Math.round(route.expectedTravelTime / 60) + ' min', true)
  let travelSteps = ''
  for (let i = 0; i < route.steps.length; i++) {
    const step = route.steps[i]
    if (!step.distance) continue
    if (travelSteps.length >= 940) { travelSteps += '\n...'; break }
    travelSteps += `\n**${step.pathIndex}. ${Math.round((step.distance * 0.0006213712 + Number.EPSILON) * 100) / 100 + ' mi'}:** ${step.instructions}`
  }
  embed.addField('Directions', travelSteps)

  const polyline = route.polyline.points.map((coordinate) => {
    if (!coordinate.latitude || !coordinate.longitude) return
    return `${coordinate.latitude},${coordinate.longitude}` // Convert MapKit coordinate to polyline coordinate
  }).filter((_, index) => {
    return index % 4 === 0 // Only keep 1/4th of the points to fit within URL lengths
  })
  const mapCenter = calculateMapCenterForRoute(polyline, route)

  const parameters = appleCompatibleUrlEncodingPleaseSendHelp({
    center: mapCenter,
    colorScheme: 'light',
    z: 13,
    spn: calculateMapSpanForRoute(mapCenter, route),
    overlays: [{ points: [...new Set(polyline)], lineWidth: 2 }],
    annotations: [{ point: polyline[0], color: '449944', glyphText: 'A' }, { point: polyline[polyline.length - 1], color: '449944', glyphText: 'B' }]
  })

  const requestURL = `https://snapshot.apple-mapkit.com${signRequest(parameters)}`
  const imageResponse = await fetch(requestURL, { method: 'GET' })
  if (imageResponse.ok) {
    const imageLink = await imgur.uploadUrl(requestURL, 'b3ISHtJ').catch(console.error)
    console.log(imageLink.data.link)
    embed.setImage(imageLink.data.link)
    embed.setDescription(`[Open in Maps](http://maps.apple.com/?saddr=${encodeURIComponent(embed.fields[0].value)}&daddr=${encodeURIComponent(embed.fields[1].value)}&dirflg=d) or [View Full Image](${imageLink.data.link})`)
  } else {
    console.error(imageResponse.statusText)
    console.error(imageResponse)
  }

  embed.setFooter('Powered by MapKit JS')
  embed.setTimestamp(new Date())
  return embed
}

client.on('ready', () => {
  console.log('Discord bot online')
})

client.on('message', async message => {
  if (message.content.startsWith('directions to')) {
    // Find directions
    let parameters = message.content.split(' ')
    parameters.splice(0, 2)
    parameters = parameters.join(' ')
    parameters = parameters.split(' from ')
    const origin = parameters[1]
    const destination = parameters[0]

    let embed = new Discord.MessageEmbed()
    embed.setTitle('Directions')
    embed.setDescription('Fetching directions from server (may take up to 30 sec.)')
    embed.addField('Origin', origin.toLowerCase().split(' ').map((s) => s.charAt(0).toUpperCase() + s.substring(1)).join(' '))
    embed.addField('Destination', destination.toLowerCase().split(' ').map((s) => s.charAt(0).toUpperCase() + s.substring(1)).join(' '))
    const reply = await message.reply(embed)

    generateRoute(origin, destination)
      .then(async route => {
        embed = await showRouteInEmbed(route, embed)
        reply.edit(embed).catch(console.error)
      }).catch(error => {
        error = error.toString().replace(/http\S+/, '[redacted]')
        console.error(error)
        embed.setDescription('Error occured! ' + error)
        embed.setColor('RED')
        reply.edit(embed).catch(console.error)
      })
  }
})

client.login(DISCORD_TOKEN)
