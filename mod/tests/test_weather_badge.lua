-- The map badge follows the stock engine's night state, not wall-clock hours (#874).
local dir = (arg[0]:match('^(.*)[/\\]') or '.')
local T = dofile(dir .. '/testlib.lua')
local S = dofile(dir .. '/stubs.lua')
local settings = require('beamngEarth/settings')
local sky = require('beamngEarth/sky')
local weather = require('beamngEarth/weather')
local clock, msg = '12:00', { code = 0, tempC = 12 }
sky.status = function() return { localTime = clock } end
weather.current = function() return msg end
local night = true
core_environment = { getLightState = function() return { isNight = night } end }
local function badge() return settings.uiMapState().weather end
T.check(badge().isNight == true, 'engine night at noon (manual sky/polar night) is retained')
T.check(badge().code == 0 and badge().tempC == 12 and badge().localTime == clock,
  'weather code, temperature and clock are unchanged')
clock, night = '00:00', false
T.check(badge().isNight == false, 'engine day at midnight (manual sky/polar day) is retained as false')
night = true
T.check(badge().isNight == true, 'each map poll reads the current state')
core_environment = nil
T.check(badge().isNight == nil and badge().code == 0, 'missing environment omits night, not weather')
core_environment = {}
T.check(badge().isNight == nil, 'missing light API is safe')
core_environment.getLightState = function() error('not ready') end
T.check(badge().isNight == nil, 'light API failure is safe')
core_environment.getLightState = function() return nil end
T.check(badge().isNight == nil, 'no light state is safe')
core_environment.getLightState = function() return {} end
T.check(badge().isNight == false, 'retain the shared lighting helper default for an empty state')
core_environment.getLightState = function() return { isNight = true } end
msg = nil
T.check(badge().code == nil and badge().isNight == true, 'a clock-only badge does not invent weather')
clock = nil
T.check(badge() == nil, 'night alone does not create an otherwise absent badge')
T.done('test_weather_badge')
