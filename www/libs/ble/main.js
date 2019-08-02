/* main.js
 *
 * Bluetooth Low Energy handler and sensor driver for Project HDROP
 * running on Dialog Semiconductor DA14580 System-on-Chip
 * 
 * Author:  Michael A. Cruz (mcruz1 at harding dot edu)
 * Date:    April 15, 2019
 * 
 */

// UUID of hdrop service.
var HDROP_SERVICE = 'EDFEC62E-9910-0BAC-5241-D8BDA6932A2F';
// UUID of sensor config characteristic (write 1 to turn sensors ON, 0 to turn sensors OFF).
var SENSOR_CONFIG = '2D86686A-53DC-25B3-0C4A-F0E10C8DEE20';
// UUID of hydration data characteristic.
var HYDRATION_DATA = '15005991-B131-3396-014C-664C9867B917';
// UUID of temperature data characteristic.
var TEMPERATURE_DATA = '6EB675AB-8BD1-1B9A-7444-621E52EC6823';

function findDevice() {
    $('textarea').val('Start scanning' + '\n');
    $('textarea').attr('rows', 2);

    document.getElementById("save").addEventListener("click", saveFile);

    // Start scanning. Two callback functions are specified.
    evothings.ble.startScan(
        onDeviceFound,
        onScanError);

    // This function is called when a device is detected, here
    // we check if we found the device we are looking for.
    function onDeviceFound(device) {
        if (device.advertisementData.kCBAdvDataLocalName !== undefined) {
            $('textarea').val($('textarea').val() + 'Found device: ' + device.advertisementData.kCBAdvDataLocalName + '\n');
            incrementTextAreaRow();
        }

        if (device.advertisementData.kCBAdvDataLocalName == 'HDROP-580') {
            $('textarea').val($('textarea').val() +'Found hdrop!' + '\n');
            incrementTextAreaRow();

            // Stop scanning.
            evothings.ble.stopScan()

            // Connect.
            connectToDevice(device)
        }
    }

    // Function called when a scan error occurs.
    function onScanError(error)
    {
        alert('Scan error: ' + error)
    }

    function saveFile() {
        window.resolveLocalFileSystemURL(cordova.file.externalDataDirectory, function (dirEntry) {
            var currentDate = new Date().toLocaleDateString();
            var currentTime = new Date().toLocaleTimeString();
            var fileName = "log-" + currentDate.replace(/[^A-Za-z0-9]/g, '-') + "-" + currentTime.replace(/[^A-Za-z0-9]/g, '-') + ".txt";
            alert(fileName);
            var isAppend = true;
            createFile(dirEntry, fileName, isAppend);
        }, onErrorLoadFs);

        function createFile(dirEntry, fileName, isAppend) {
            // Creates a new file or returns the file if it already exists.
            dirEntry.getFile(fileName, {create: true, exclusive: false}, function(fileEntry) {
                var text = $('textarea').val();
                var dataObj = new Blob([text], { type: 'text/plain' });
                writeFile(fileEntry, dataObj, isAppend);
            }, onErrorCreateFile);
        }

        function writeFile(fileEntry, dataObj, isAppend) {
            // Create a FileWriter object for our FileEntry (log.txt).
            fileEntry.createWriter(function (fileWriter) {
                fileWriter.onwriteend = function() {
                    readFile(fileEntry);
                };

                fileWriter.onerror = function (e) {
                    alert("Failed file write: " + e.toString());
                };

                // If we are appending data to file, go to the end of the file.
                if (isAppend) {
                    try {
                        fileWriter.seek(fileWriter.length);
                    }
                    catch (e) {
                        alert("file doesn't exist!");
                    }
                }

                fileWriter.write(dataObj);
            });
        }

        function onErrorCreateFile(error) {
            alert("Create file error: " + error.code)
        }

        function onErrorLoadFs(error) {
            alert("Load Fs error: " + error.code)
        }
    }
}

function connectToDevice(device)
{
    evothings.ble.connectToDevice(
        device,
        onConnected,
        onDisconnected,
        onConnectError)

    function onConnected(device) {
        $('textarea').val($('textarea').val() + 'Connected to device' + '\n');
        incrementTextAreaRow();

        // Enable notifications for sensors.
        enableSensorNotifications(device)
    }

    // Function called if the device disconnects.
    function onDisconnected(error) {
        alert('Device disconnected')
        findDevice();
    }

    // Function called when a connect error occurs.
    function onConnectError(error) {
        alert('Connect error: ' + error)
        findDevice();
    }
}

function enableSensorNotifications(device) {
    // Get hdrop service and characteristics.
    var service = evothings.ble.getService(device, HDROP_SERVICE)
    var sensorConfigCharacteristic = evothings.ble.getCharacteristic(service, SENSOR_CONFIG)
    var hydrationDataCharacteristic = evothings.ble.getCharacteristic(service, HYDRATION_DATA)
    var temperatureDataCharacteristic = evothings.ble.getCharacteristic(service, TEMPERATURE_DATA)

    // Turn sensors ON.
    evothings.ble.writeCharacteristic(
        device,
        sensorConfigCharacteristic,
        new Uint8Array([1]),
        onSensorsActivated,
        onSensorsActivatedError);

    function onSensorsActivated() {
        $('textarea').val($('textarea').val() + 'Sensors are ON');
        $('textarea').val('');
        $('textarea').attr('rows', 1);

        // Enable notifications from the hydration sensor.
        evothings.ble.enableNotification(
            device,
            hydrationDataCharacteristic,
            onHydrationNotification,
            onHydrationNotificationError);

        // Enable notifications from the temperature sensor.
        evothings.ble.enableNotification(
            device,
            temperatureDataCharacteristic,
            onTemperatureNotification,
            onTemperatureNotificationError);
    }

    function onSensorsActivatedError(error) {
        alert('Sensors activate error: ' + error);
    }

    // Called repeatedly until disableNotification is called.
    function onHydrationNotification(data) {
        var res = calculateRes(data);
        var today = new Date().toLocaleString();

        if ($('textarea').attr('rows') == 1) {
            $('textarea').val(today + ', ' + res);
            $('textarea').attr('rows', 2);
        }
        else {
            $('textarea').val($('textarea').val() + '\n' + today + ', ' + res);
            incrementTextAreaRow();
        }
    }

    function onHydrationNotificationError(error) {
        alert('Hydration notification error: ' + error)
    }

    // Called repeatedly until disableNotification is called.
    function onTemperatureNotification(data) {
        var res = calculateRes(data);
        res = res * (3.6 / 1023);
        $('textarea').val($('textarea').val() + ', ' + res);
    }

    function onTemperatureNotificationError(error) {
        alert('Temperature notification error: ' + error)
    }
}

// Calculate the bit resolution from raw sensor data.
function calculateRes(data) {
    // Get 16 bit value from data buffer in little endian format.
    var value = new DataView(data).getUint16(0, true)

    // Extraction of conductivity value, based on sfloatExp2ToDouble
    // from BLEUtility.m in Texas Instruments TI BLE SensorTag
    // iOS app source code.
    var mantissa = value & 0x0FFF
    var exponent = value >> 12

    var magnitude = Math.pow(2, exponent)
    return (mantissa * magnitude)
}

function incrementTextAreaRow() {
    var text = $("textarea").val();   
    var lines = text.split(/\r|\r\n|\n/);
    var count = lines.length;
    $('textarea').attr('rows', count + 1);
}

// Start scanning for devices when the plugin has loaded.
document.addEventListener('deviceready', findDevice, false);