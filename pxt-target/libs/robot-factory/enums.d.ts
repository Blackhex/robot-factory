declare const enum PartType {
    //% block="Small Wheel"
    WheelSmall = 0,
    //% block="Medium Wheel"
    WheelMedium = 1,
    //% block="Large Wheel"
    WheelLarge = 2,
    //% block="Proximity Sensor"
    SensorProximity = 3,
    //% block="Camera Sensor"
    SensorCamera = 4,
    //% block="LIDAR Sensor"
    SensorLidar = 5,
    //% block="Standard Battery"
    BatteryStandard = 6,
    //% block="High-Capacity Battery"
    BatteryHighCapacity = 7,
    //% block="Light Chassis"
    ChassisLight = 8,
    //% block="Heavy Chassis"
    ChassisHeavy = 9,
    //% block="Basic Circuit"
    CircuitBasic = 10,
    //% block="Advanced Circuit"
    CircuitAdvanced = 11,
    //% block="Basic Drivetrain"
    DrivetrainBasic = 12,
    //% block="Advanced Drivetrain"
    DrivetrainAdvanced = 13,
    //% block="Basic Sensor Array"
    SensorArrayBasic = 14,
    //% block="Advanced Sensor Array"
    SensorArrayAdvanced = 15,
    //% block="Standard Power Unit"
    PowerUnitStandard = 16,
    //% block="High Power Unit"
    PowerUnitHigh = 17,
    //% block="Raw Material"
    RawMaterial = 18,
}

declare const enum FactoryCondition {
    //% block="belt has items"
    BeltHasItems = 0,
    //% block="machine is idle"
    MachineIdle = 1,
    //% block="items remaining"
    ItemsRemaining = 2,
}
