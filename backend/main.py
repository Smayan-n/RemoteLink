import time

import numpy as np
from rtlsdr import RtlSdr

from ws_server import handle_packet, notify_button_down, notify_button_up, start_ws_server


# initialize and configure the SDR
# NOTE: ---- These params are for the EV1527 frame packet (which is the most common radio wireless chip/protocol in common rf remotes) ----
sdr = RtlSdr()
sdr.sample_rate = 2.048e6  # 2.048 MHz sample rate
sdr.center_freq = 433.92e6
sdr.gain = 25  # you can change this to 'auto' if you want it to adapt dynamically

# each EV1527 packet is 128*T (where T is roughl 800) samples long, so we read frame lightly larger than that
NUM_SAMPLES = 128 * 1024

# Threshold for detecting a button press vs background static noise
# If it's triggering constantly without pressing anything, raise this to 0.08 or 0.1
SIGNAL_THRESHOLD = 0.5

# EV1527 timing tolerances
T_MIN = 600
T_MAX = 1050
NOISE_FLOOR = 150  # any state lasting less than this is considered static noise


def group_into_states_rle(amplitudes, thresh):
    # blazing fast vectorized run-length encoding using numpy
    # compresses floats into a tiny list of (state, duration) tuples
    binary = (amplitudes > thresh).astype(np.int8)

    # find exact indices where the state flips (0->1 or 1->0)
    change_indices = np.where(np.diff(binary))[0] + 1

    # cap the ends to calculate total run lengths
    boundaries = np.concatenate(([0], change_indices, [len(binary)]))
    run_lengths = np.diff(boundaries)
    states_vals = binary[boundaries[:-1]]

    # return as list of tuples for easy state-machine logic
    return list(zip(states_vals, run_lengths))


def sanitize_states(states):
    # cleans noise and merges decoupled states tuples as needed
    if not states:
        return []

    filtered_states = []
    for state, run_len in states:
        if run_len >= NOISE_FLOOR:
            filtered_states.append((state, run_len))

    if not filtered_states:
        return []

    # Collapse adjacent identical states that were separated by noise
    sanitized_output = [filtered_states[0]]

    for next_state, next_run_len in filtered_states[1:]:
        last_state, last_run_len = sanitized_output[-1]

        if next_state == last_state:
            # if the states match, noise was deleted between them
            # pop last element, add durations together, and merge them
            sanitized_output[-1] = (last_state, last_run_len + next_run_len)
        else:
            # if they alternate (0 to 1 or 1 to 0), ignore
            sanitized_output.append((next_state, next_run_len))

    return sanitized_output


def is_within_T(run_len, t_mult):
    return (t_mult * T_MIN) <= run_len <= (t_mult * T_MAX)


def find_packets(states):
    def decode_bit(s1, s2):
        # logical 0 bit is (1T high then 3T low)
        # locical 1 bit is (3T high then 1T low)
        if s1[0] == 1 and is_within_T(s1[1], 1):
            if s2[0] == 0 and is_within_T(s2[1], 3):
                return "0"

        if s1[0] == 1 and is_within_T(s1[1], 3):
            if s2[0] == 0 and is_within_T(s2[1], 1):
                return "1"

        # else return invalid casue the data is not complete
        return None

    # holds (remote_id, btn_id) tuples
    detected_payloads = []

    # We need at least 50 states to form a packet
    for idx in range(len(states) - 50):
        state, run_len = states[idx]

        # find preambles (1T High followed by 31T low)
        if state == 1 and is_within_T(run_len, 1):
            next_state, next_run_len = states[idx + 1]

            if next_state == 0 and is_within_T(next_run_len, 31):
                # found preamble!
                # now decode data, which is 96T elems (20 bit remote id follwoed by 4 bit data)
                bits = []
                data_start_idx = idx + 2

                for i in range(data_start_idx, data_start_idx + 48, 2):
                    # look at 2 state run-lenghts at a time to get logical bit
                    bit = decode_bit(states[i], states[i + 1])
                    if bit is not None:
                        bits.append(bit)
                    else:
                        break  # data corrupted

                # only look at full data payloads for now
                if len(bits) == 24:
                    bit_string = "".join(bits)
                    remote_id = bit_string[:20]
                    btn_id = bit_string[20:]
                    detected_payloads.append((remote_id, btn_id))

    return detected_payloads


print("SDR Ready. Listening for any button press on 433.92 MHz...")
print("Press Ctrl+C to stop.\n")

start_ws_server()

# stores unparsed RLE states that haven't formed a full packet yet
historical_rle_chain = []

# debouncer variables to ensure a crisp 1-to-1 trigger response
last_triggered_id = None
last_triggered_time = 0.0
DEBOUNCE_THRESHOLD_SEC = 0.35

active_button_presses = {}
RELEASE_GAP_SEC = 0.6

try:
    while True:
        # Read a tiny chunk of raw radio data from the air
        # buffer duration is 64ms
        samples = sdr.read_samples(NUM_SAMPLES)
        amplitudes = np.abs(samples)

        # analysis + rle-array using the fast numpy method
        new_rle_chunk = group_into_states_rle(amplitudes, SIGNAL_THRESHOLD)

        if not new_rle_chunk:
            continue

        # stitch the boundary metadata
        if historical_rle_chain:
            last_hist_state, last_hist_len = historical_rle_chain[-1]
            new_head_state, new_head_len = new_rle_chunk[0]

            if last_hist_state == new_head_state:
                # boundary cut a pulse in half, combine it
                historical_rle_chain[-1] = (
                    last_hist_state,
                    last_hist_len + new_head_len,
                )
                historical_rle_chain.extend(new_rle_chunk[1:])
            else:
                historical_rle_chain.extend(new_rle_chunk)
        else:
            historical_rle_chain.extend(new_rle_chunk)

        # cleans noise and merges decoupled states
        clean_states = sanitize_states(historical_rle_chain)

        # now find all packets using the rle state array
        payloads = find_packets(clean_states)
        # print(active_button_presses)

        # clean up active presses
        current_time = time.time()
        for k, v in active_button_presses.items():
            # print(current_time - active_button_presses[unique_token]["last_pkt"])
            if current_time - v["last_pkt"] > (RELEASE_GAP_SEC) and not v["btn_up"]:
                # button up
                press_time = current_time - v["down_at"]
                active_button_presses[k]["btn_up"] = True
                # emit event
                notify_button_up(k[0], k[1], current_time, press_time)
                # print(
                #     str(k) + " BUTTON UP ---- PRESSED FOR: ",
                #     str(press_time) + "s",
                # )

        if payloads:
            current_time = time.time()
            for remote_id, btn_id in payloads:

                unique_token = (remote_id, btn_id)

                # continuus singnal decoding - for button hold and release
                if (
                    unique_token not in active_button_presses
                    or active_button_presses[unique_token]["btn_up"]
                ):
                    # print(str(unique_token) + " BUTTON DOWN")
                    # send button down event
                    notify_button_down(remote_id, btn_id, current_time, 0)
                    active_button_presses[unique_token] = {
                        "down_at": current_time,
                        "last_pkt": current_time,
                        "btn_up": False,
                    }
                else:
                    # button still down - update last pkt seen time
                    active_button_presses[unique_token]["last_pkt"] = current_time

                # debouncer logic
                if (
                    unique_token == last_triggered_id
                    and (current_time - last_triggered_time) < DEBOUNCE_THRESHOLD_SEC
                ):
                    continue  # ignore packet echo

                # we found full data payload
                # print("------------ Button Press ------------ ")
                # print("remote id: ", remote_id)
                # print("btn id: ", btn_id)
                # print("--------------------------------------")

                handle_packet(remote_id, btn_id)

                last_triggered_id = unique_token
                last_triggered_time = current_time

        # cut off old values to prevent memory leak
        # keep last 150 states for the trailing fragments
        if len(historical_rle_chain) > 150:
            historical_rle_chain = historical_rle_chain[-150:]

        # if the last state is a LOW (0) lasting more than 50k samples,
        # the frame train is over. wipe history to kill ghost packets (and stop print loops)
        if (
            historical_rle_chain
            and historical_rle_chain[-1][0] == 0
            and historical_rle_chain[-1][1] > 50000
        ):
            historical_rle_chain = [historical_rle_chain[-1]]

except KeyboardInterrupt:
    print("\nStopping script...")
finally:
    sdr.close()
    print("SDR safely closed.")
