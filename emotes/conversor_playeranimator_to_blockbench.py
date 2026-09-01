"""
================================================================================
    PLAYERANIMATOR TO BLOCKBENCH ANIMATION CONVERTER
    Version 1.0.0
================================================================================

    Developed by: nabkami
    License: All rights reserved

    DESCRIPTION
    -----------
    Professional-grade converter that transforms PlayerAnimator/Emotecraft 
    animation files (.json) into Blockbench/GeckoLib compatible format 
    (.animation.json).
    
    This tool enables seamless workflow between Blender animations exported 
    via PlayerAnimator and Minecraft modding tools like Blockbench and GeckoLib.

    KEY FEATURES
    ------------
    • Full rotation conversion (pitch, yaw, roll) with proper axis mapping
    • Position/translation support for all body parts
    • Bend/joint animation support (elbows, knees)
    • Automatic keyframe interpolation inheritance
    • Batch conversion for entire folders
    • Maintains animation timing and structure

    SUPPORTED BODY PARTS
    --------------------
    • head          - Head rotation and position
    • torso         - Body/chest rotation and position  
    • rightArm      - Right arm with bend support (elbow)
    • leftArm       - Left arm with bend support (elbow)
    • rightLeg      - Right leg with bend support (knee)
    • leftLeg       - Left leg with bend support (knee)

    USAGE
    -----
    Single file:
        python conversor_playeranimator_to_blockbench.py <input.json>
        python conversor_playeranimator_to_blockbench.py <input.json> <output.animation.json>
    
    Batch (folder):
        python conversor_playeranimator_to_blockbench.py <folder_path>

    TECHNICAL NOTES
    ---------------
    • PlayerAnimator uses radians by default (degrees=false)
    • Blockbench/GeckoLib uses degrees for rotations
    • Scale factor: 1 Blender unit = 4 Blockbench pixels
    • Keyframes preserve easing functions when converting
    • Missing axis values in subsequent frames inherit from previous keyframes

    OUTPUT FORMAT
    -------------
    Generates GeckoLib-compatible animation files with:
    • format_version: "1.8.0"
    • Proper bone hierarchy
    • Rotation and position keyframes
    • Easing interpolation data

================================================================================
"""

import json
import math
import os
import sys
from decimal import Decimal, InvalidOperation

# =============================================================================
# CONFIGURATION - T-Pose in Blender (initial positions of each bone)
# =============================================================================

POSE_T_BLENDER = {
    "head":     {"x": 0,     "y": 0, "z": 3},
    "torso":    {"x": 0,     "y": 0, "z": 0},
    "rightArm": {"x": 1.25,  "y": 0, "z": 2.5},
    "leftArm":  {"x": -1.25, "y": 0, "z": 2.5},
    "rightLeg": {"x": 0.5,   "y": 0, "z": 0},
    "leftLeg":  {"x": -0.5,  "y": 0, "z": 0},
}

# T-Pose converted to PlayerAnimator values (calculated with export script formulas)
POSE_T_PLAYERANIMATOR = {
    "head":     {"x": 0,  "y": -15, "z": 0},
    "torso":    {"x": 0,  "y": 0,   "z": 0},
    "rightArm": {"x": -5, "y": 2,   "z": 0},
    "leftArm":  {"x": 5,  "y": 2,   "z": 0},
    "rightLeg": {"x": -2, "y": 12,  "z": 0},
    "leftLeg":  {"x": 2,  "y": 12,  "z": 0},
}

# Scale factor: 1 Blender unit = 4 Blockbench pixels
SCALE_FACTOR = 4

# =============================================================================
# EASING MAPPING - PlayerAnimator to Blockbench/GeckoLib
# =============================================================================

EASING_MAP = {
    "LINEAR": "linear",
    "CONSTANT": "step",  # In GeckoLib it's called "step"
    "EASEINQUAD": "easeInQuad",
    "EASEOUTQUAD": "easeOutQuad",
    "EASEINOUTQUAD": "easeInOutQuad",
    "EASEINSINE": "easeInSine",
    "EASEOUTSINE": "easeOutSine",
    "EASEINOUTSINE": "easeInOutSine",
    "EASEINCUBIC": "easeInCubic",
    "EASEOUTCUBIC": "easeOutCubic",
    "EASEINOUTCUBIC": "easeInOutCubic",
    "EASEINEXPO": "easeInExpo",
    "EASEOUTEXPO": "easeOutExpo",
    "EASEINOUTEXPO": "easeInOutExpo",
    "EASEINCIRC": "easeInCirc",
    "EASEOUTCIRC": "easeOutCirc",
    "EASEINOUTCIRC": "easeInOutCirc",
    "EASEINBACK": "easeInBack",
    "EASEOUTBACK": "easeOutBack",
    "EASEINOUTBACK": "easeInOutBack",
    "EASEINELASTIC": "easeInElastic",
    "EASEOUTELASTIC": "easeOutElastic",
    "EASEINOUTELASTIC": "easeInOutElastic",
    "EASEINBOUNCE": "easeInBounce",
    "EASEOUTBOUNCE": "easeOutBounce",
    "EASEINOUTBOUNCE": "easeInOutBounce",
}

# =============================================================================
# BONE NAME MAPPING
# =============================================================================

BONE_NAME_MAP = {
    "head": "head",
    "torso": "torso",  # Keep as "torso" (same as in the model)
    "rightArm": "rightArm",
    "leftArm": "leftArm",
    "rightLeg": "rightLeg",
    "leftLeg": "leftLeg",
}

# =============================================================================
# CONVERSION FUNCTIONS
# =============================================================================

def convert_easing(pa_easing: str) -> str:
    """Converts easing function name from PlayerAnimator to GeckoLib."""
    # Normalize: remove spaces, uppercase
    normalized = pa_easing.upper().replace(" ", "").replace("_", "")
    return EASING_MAP.get(normalized, "linear")


def convert_rotation_to_degrees(value_radians: float, is_degrees: bool) -> float:
    """Converts rotation from radians to degrees if necessary."""
    if is_degrees:
        return value_radians  # Already in degrees
    return value_radians * (180.0 / math.pi)


def convert_position_pa_to_blockbench(bone_name: str, pa_x=None, pa_y=None, pa_z=None):
    """
    Converts position from PlayerAnimator to Blockbench.

    PlayerAnimator -> Blender -> Blockbench

    Axis mapping:
    - PA x -> Blender X -> Blockbench X (lateral)
    - PA y -> Blender Z -> Blockbench Y (height)
    - PA z -> Blender Y -> Blockbench Z (depth)
    """
    pose_t_pa = POSE_T_PLAYERANIMATOR.get(bone_name, {"x": 0, "y": 0, "z": 0})
    pose_t_blender = POSE_T_BLENDER.get(bone_name, {"x": 0, "y": 0, "z": 0})

    result = {}

    # Determine special offsets based on the bone
    # Original script has +12 offsets for arms and legs on Y axis
    # And +-0.1 offsets for legs on X and Z axes

    if pa_x is not None:
        # PA_x -> Blender_X -> Blockbench_X
        # First: PA_x to Blender_X
        # For torso: Blender_X = PA_x / 0.25 = PA_x * 4
        # For others: Blender_X = PA_x / -4

        if bone_name == "torso":
            blender_x = pa_x * 4
        else:
            blender_x = pa_x / -4

        # Calculate delta from T-pose
        delta_blender_x = blender_x - pose_t_blender["x"]

        # Blender X -> Blockbench X (same axis, factor 4, INVERT sign)
        blockbench_x = delta_blender_x * SCALE_FACTOR * -1  # Invert X
        result["x"] = round(blockbench_x, 4)

    if pa_y is not None:
        # PA_y -> Blender_Z -> Blockbench_Y
        # Remove offset based on bone

        if bone_name in ["rightArm", "leftArm", "rightLeg", "leftLeg", "head"]:
            pa_y_adjusted = pa_y - 12  # Remove offset
        else:
            pa_y_adjusted = pa_y

        if bone_name == "torso":
            blender_z = pa_y_adjusted * 4
        else:
            blender_z = pa_y_adjusted / -4

        delta_blender_z = blender_z - pose_t_blender["z"]

        # Blender Z -> Blockbench Y (height)
        blockbench_y = delta_blender_z * SCALE_FACTOR
        result["y"] = round(blockbench_y, 4)

    if pa_z is not None:
        # PA_z -> Blender_Y -> Blockbench_Z

        if bone_name == "torso":
            blender_y = pa_z * 4 * -1  # Torso has Z inversion
        else:
            blender_y = pa_z / -4

        delta_blender_y = blender_y - pose_t_blender["y"]

        # Blender Y -> Blockbench Z (depth, INVERT sign)
        blockbench_z = delta_blender_y * SCALE_FACTOR * -1  # Invert Z
        result["z"] = round(blockbench_z, 4)

    return result


def convert_rotation_pa_to_blockbench(bone_name: str, pitch=None, yaw=None, roll=None, is_degrees=False):
    """
    Converts rotation from PlayerAnimator to Blockbench.

    Mapping:
    - pitch (PA) -> X (Blockbench)
    - yaw (PA) -> Y (Blockbench)
    - roll (PA) -> Z (Blockbench)

    PlayerAnimator can use radians (degrees=false) or degrees (degrees=true)
    Blockbench always uses degrees

    Torso has different conventions - needs pitch and yaw inversion.
    """
    result = {}

    # Torso has different rotation conventions than other bones
    # Torso's Pitch and Yaw need to be inverted for Blockbench
    torso_invert = -1 if bone_name == "torso" else 1

    if pitch is not None:
        degrees = convert_rotation_to_degrees(pitch, is_degrees)
        result["x"] = round(degrees * torso_invert, 4)

    if yaw is not None:
        degrees = convert_rotation_to_degrees(yaw, is_degrees)
        result["y"] = round(degrees * torso_invert, 4)

    if roll is not None:
        degrees = convert_rotation_to_degrees(roll, is_degrees)
        result["z"] = round(degrees, 4)  # Roll is not inverted

    return result


def ticks_to_seconds(ticks: int) -> float:
    """Converts Minecraft ticks to seconds."""
    return ticks / 20.0


def ticks_to_time_key(ticks: int) -> str:
    """Converts Minecraft ticks to a stable decimal string time key.

    Uses exact integer math to avoid float artifacts like 0.30000000000000004.
    Ensures the first keyframe is represented as "0.0".
    """
    if ticks == 0:
        return "0.0"

    # ticks / 20 has finite decimals (denominator 2^2 * 5).
    if ticks % 20 == 0:
        return f"{ticks // 20}.0"

    if ticks % 2 == 0:
        # (ticks/2) / 10 -> one decimal
        tenths = ticks // 2
        return f"{tenths // 10}.{tenths % 10}"

    # odd ticks -> x.05 -> two decimals
    hundredths = ticks * 5  # because ticks/20 = ticks*5/100
    return f"{hundredths // 100}.{hundredths % 100:02d}"


def _sorted_time_keys(keys):
    def _k(s: str):
        try:
            return (Decimal(s),)
        except (InvalidOperation, TypeError):
            return (Decimal("Infinity"),)
    return sorted(keys, key=_k)


def ensure_zero_first_keyframe(keyframes: dict) -> dict:
    """Return a new dict with '0.0' present and ordered first, then by time."""
    if "0.0" not in keyframes:
        keyframes = {**keyframes, "0.0": {"vector": [0, 0, 0], "easing": "linear"}}

    ordered = {}
    ordered["0.0"] = keyframes["0.0"]
    for k in _sorted_time_keys([k for k in keyframes.keys() if k != "0.0"]):
        ordered[k] = keyframes[k]
    return ordered


def convert_animation(pa_animation: dict) -> dict:
    """
    Converts a complete PlayerAnimator animation to GeckoLib/Blockbench format.
    """
    emote = pa_animation.get("emote", {})
    is_degrees = emote.get("degrees", False)
    moves = emote.get("moves", [])
    
    # IMPORTANT: Sort moves by tick to process in chronological order
    # This is necessary to correctly inherit values from previous keyframes
    moves_sorted = sorted(moves, key=lambda m: m.get("tick", 0))

    # Calculate duration
    end_tick = emote.get("endTick", 0)
    animation_length = ticks_to_seconds(end_tick)

    # Data structures to accumulate keyframes per bone
    bones_data = {}
    
    # Data structures to maintain last known values per bone (for inheritance)
    last_rotation = {}  # {bone_name: [x, y, z]}
    last_position = {}  # {bone_name: [x, y, z]}

    for move in moves_sorted:
        tick = move.get("tick", 0)
        time_seconds = ticks_to_seconds(tick)
        time_key = ticks_to_time_key(tick)
        easing = convert_easing(move.get("easing", "LINEAR"))

        # Process each bone in the move
        for bone_name in ["head", "torso", "rightArm", "leftArm", "rightLeg", "leftLeg"]:
            if bone_name not in move:
                continue

            bone_data = move[bone_name]
            blockbench_bone = BONE_NAME_MAP.get(bone_name, bone_name)

            if blockbench_bone not in bones_data:
                bones_data[blockbench_bone] = {"rotation": {}, "position": {}}
            
            # Initialize last known values if they don't exist
            if blockbench_bone not in last_rotation:
                last_rotation[blockbench_bone] = [0, 0, 0]
            if blockbench_bone not in last_position:
                last_position[blockbench_bone] = [0, 0, 0]

            # Process rotations
            pitch = bone_data.get("pitch")
            yaw = bone_data.get("yaw")
            roll = bone_data.get("roll")

            if any(v is not None for v in [pitch, yaw, roll]):
                rot = convert_rotation_pa_to_blockbench(bone_name, pitch, yaw, roll, is_degrees)

                # Get existing rotation at this time or create new one inheriting previous values
                if time_key not in bones_data[blockbench_bone]["rotation"]:
                    # IMPORTANT: Inherit last known values
                    bones_data[blockbench_bone]["rotation"][time_key] = {
                        "vector": last_rotation[blockbench_bone][:],  # Copy of last values
                        "easing": easing
                    }

                current = bones_data[blockbench_bone]["rotation"][time_key]["vector"]
                if "x" in rot:
                    current[0] = rot["x"]
                if "y" in rot:
                    current[1] = rot["y"]
                if "z" in rot:
                    current[2] = rot["z"]
                
                # ALWAYS update last known values with current keyframe state
                last_rotation[blockbench_bone] = current[:]

            # Process positions
            px = bone_data.get("x")
            py = bone_data.get("y")
            pz = bone_data.get("z")

            if any(v is not None for v in [px, py, pz]):
                pos = convert_position_pa_to_blockbench(bone_name, px, py, pz)

                if time_key not in bones_data[blockbench_bone]["position"]:
                    # IMPORTANT: Inherit last known values
                    bones_data[blockbench_bone]["position"][time_key] = {
                        "vector": last_position[blockbench_bone][:],  # Copy of last values
                        "easing": easing
                    }

                current = bones_data[blockbench_bone]["position"][time_key]["vector"]
                if "x" in pos:
                    current[0] = pos["x"]
                if "y" in pos:
                    current[1] = pos["y"]
                if "z" in pos:
                    current[2] = pos["z"]
                
                # Update last known values
                last_position[blockbench_bone] = current[:]

            # Process bend (applied to _bend bone as X rotation)
            bend = bone_data.get("bend")
            if bend is not None and bone_name != "head":  # head has no bend
                bend_bone = f"{blockbench_bone}_bend"

                if bend_bone not in bones_data:
                    bones_data[bend_bone] = {"rotation": {}, "position": {}}

                # Convert bend to degrees (it's X rotation)
                bend_degrees = convert_rotation_to_degrees(bend, is_degrees)

                if time_key not in bones_data[bend_bone]["rotation"]:
                    bones_data[bend_bone]["rotation"][time_key] = {"vector": [0, 0, 0], "easing": easing}

                bones_data[bend_bone]["rotation"][time_key]["vector"][0] = round(bend_degrees, 4)

    # Build final GeckoLib structure
    geckolib_bones = {}

    for bone_name, data in bones_data.items():
        bone_entry = {}

        # Add rotations
        if data["rotation"]:
            rotation_keyframes = {}
            for time_key, rot_data in data["rotation"].items():
                # Always use object format for every keyframe
                rotation_keyframes[time_key] = {
                    "vector": rot_data["vector"],
                    "easing": rot_data["easing"]
                }
            bone_entry["rotation"] = ensure_zero_first_keyframe(rotation_keyframes)

        # Add positions
        if data["position"]:
            position_keyframes = {}
            for time_key, pos_data in data["position"].items():
                # Always use object format for every keyframe
                position_keyframes[time_key] = {
                    "vector": pos_data["vector"],
                    "easing": pos_data["easing"]
                }
            bone_entry["position"] = ensure_zero_first_keyframe(position_keyframes)

        if bone_entry:
            geckolib_bones[bone_name] = bone_entry

    # rotation/position keyframes are already normalized to include and start with "0.0"

    return {
        "animation_length": animation_length,
        "bones": geckolib_bones
    }


def convert_file(input_path: str, output_path: str = None):
    """
    Converts a PlayerAnimator JSON file to GeckoLib format.

    Args:
        input_path: Path to PlayerAnimator JSON file
        output_path: Output path (optional, defaults to adding .animation.json)
    """
    with open(input_path, 'r', encoding='utf-8') as f:
        pa_data = json.load(f)

    # Get animation name
    anim_name = pa_data.get("name", os.path.splitext(os.path.basename(input_path))[0])
    # Clean name (only snake_case allowed in GeckoLib)
    anim_name_clean = anim_name.replace(" ", "_").replace("-", "_").lower()

    # Convert
    converted = convert_animation(pa_data)

    # Final GeckoLib structure
    geckolib_output = {
        "format_version": "1.8.0",
        "animations": {
            anim_name_clean: converted
        }
    }

    # Determine output path
    if output_path is None:
        base = os.path.splitext(input_path)[0]
        output_path = f"{base}.animation.json"

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(geckolib_output, f, indent='\t', ensure_ascii=False)

    print(f"Converted: {input_path}")
    print(f"Saved to: {output_path}")

    return output_path


def convert_folder(input_folder: str, output_folder: str = None):
    """
    Converts all JSON files in a folder.
    """
    if output_folder is None:
        output_folder = os.path.join(input_folder, "converted_blockbench")

    os.makedirs(output_folder, exist_ok=True)

    converted_files = []
    for filename in os.listdir(input_folder):
        if filename.endswith('.json') and not filename.endswith('.animation.json'):
            input_path = os.path.join(input_folder, filename)
            output_path = os.path.join(output_folder, filename.replace('.json', '.animation.json'))
            try:
                convert_file(input_path, output_path)
                converted_files.append(output_path)
            except Exception as e:
                print(f"Error converting {filename}: {e}")

    return converted_files


# =============================================================================
# MAIN
# =============================================================================

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage:")
        print("  python conversor_playeranimator_to_blockbench.py <file.json>")
        print("  python conversor_playeranimator_to_blockbench.py <file.json> <output.animation.json>")
        print("  python conversor_playeranimator_to_blockbench.py <folder>")
        print("")
        print("Example:")
        print("  python conversor_playeranimator_to_blockbench.py my_animation.json")
        print("  python conversor_playeranimator_to_blockbench.py my_animation.json output.animation.json")
        print("  python conversor_playeranimator_to_blockbench.py ./blender_animations/")
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else None

    if os.path.isfile(input_path):
        convert_file(input_path, output_path)
    elif os.path.isdir(input_path):
        convert_folder(input_path)
    else:
        print(f"Error: Cannot find '{input_path}'")
        sys.exit(1)
