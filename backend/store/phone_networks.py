# store/phone_networks.py
UNSUPPORTED_SMS_PREFIXES = {
    "0813",

    "0900", "0907", "0908", "0909",

    "0910", "0911", "0912", "0913", "0914",
    "0918", "0919",

    "0920", "0921", "0922", "0923",
    "0925", "0928", "0929",

    "0930", "0931", "0932", "0933",
    "0938", "0939",

    "0940", "0941", "0942", "0943",
    "0946", "0947", "0948", "0949",

    "0950", "0951",

    "0960", "0961", "0962", "0963", "0964",
    "0968", "0969",

    "0970", "0971", "0972", "0973", "0974",

    "0980", "0981", "0982", "0985", "0989",

    "0998", "0999",
}


def is_unsupported_sms_prefix(phone):
    if not phone:
        return False

    digits = "".join(
        character
        for character in str(phone)
        if character.isdigit()
    )

    if digits.startswith("639") and len(digits) == 12:
        digits = "0" + digits[2:]

    if len(digits) != 11 or not digits.startswith("09"):
        return False

    return digits[:4] in UNSUPPORTED_SMS_PREFIXES