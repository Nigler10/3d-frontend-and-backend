// src/components/address/AddressSelector.jsx
import { useMemo } from "react";
import {
    listRegions,
    listProvinces,
    listMuncities,
    listBarangays
} from "@jobuntux/psgc";
import SearchableSelect from "./SearchableSelect";

function AddressSelector({ value, onChange }) {
    const updateAddress = (changes) => {
        onChange({
            ...value,
            ...changes
        });
    };

    const regionList = useMemo(() => {
        return listRegions()
            .filter((region) => {
                const name = region.regionName?.toLowerCase() || "";

                return (
                    name.includes("national capital region") ||
                    name.includes("ncr") ||
                    name.includes("calabarzon") ||
                    name.includes("region iv-a") ||
                    name.includes("region 4a")
                );
            })
            .map((region) => ({
                name: region.regionName,
                psgc_code: region.psgcCode || region.regCode,
                lookup_code: region.regCode
            }));
    }, []);

    const selectedRegion = regionList.find(
        (region) => region.psgc_code === value.region_code
    );

    const provinceList = useMemo(() => {
        if (!selectedRegion) return [];

        return listProvinces(selectedRegion.lookup_code).map((province) => ({
            name: province.provName,
            psgc_code: province.psgcCode || province.provCode,
            lookup_code: province.provCode,
            cityClass: province.cityClass
        }));
    }, [selectedRegion]);

    const selectedProvince = provinceList.find(
        (province) => province.psgc_code === value.province_code
    );

    const cityList = useMemo(() => {
        if (!selectedProvince) return [];

        return listMuncities(selectedProvince.lookup_code).map((city) => ({
            name: city.munCityName,
            psgc_code: city.psgcCode || city.munCityCode,
            lookup_code: city.munCityCode
        }));
    }, [selectedProvince]);

    const selectedCity = cityList.find(
        (city) => city.psgc_code === value.city_code
    );

    const barangayList = useMemo(() => {
        if (!selectedCity) return [];

        return listBarangays(selectedCity.lookup_code).map((barangay) => ({
            name: barangay.brgyOldName
                ? `${barangay.brgyName} (${barangay.brgyOldName})`
                : barangay.brgyName,
            psgc_code: barangay.psgcCode || barangay.brgyCode,
            lookup_code: barangay.brgyCode
        }));
    }, [selectedCity]);

    const handleRegionSelect = (region) => {
        updateAddress({
            region: region?.name || "",
            region_code: region?.psgc_code || "",
            province: "",
            province_code: "",
            city: "",
            city_code: "",
            barangay: "",
            barangay_code: ""
        });
    };

    const handleProvinceSelect = (province) => {
        updateAddress({
            province: province?.name || "",
            province_code: province?.psgc_code || "",
            city: "",
            city_code: "",
            barangay: "",
            barangay_code: ""
        });
    };

    const handleCitySelect = (city) => {
        updateAddress({
            city: city?.name || "",
            city_code: city?.psgc_code || "",
            barangay: "",
            barangay_code: ""
        });
    };

    const handleBarangaySelect = (barangay) => {
        updateAddress({
            barangay: barangay?.name || "",
            barangay_code: barangay?.psgc_code || ""
        });
    };

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-[#6E473B] tracking-wide uppercase">
                    House / Unit / Street / Subdivision
                </label>

                <input
                    type="text"
                    value={value.street}
                    onChange={(e) => updateAddress({ street: e.target.value })}
                    placeholder="e.g. Blk 10 Lot 5, Camella Homes"
                    className="w-full px-4 py-2.5 bg-[#FCF8EE]/50 border border-[#E6CCA2] rounded-xl text-sm text-[#6E473B] placeholder-[#CBB294] outline-none focus:border-[#C05A11] focus:bg-white transition-all"
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SearchableSelect
                    label="Region"
                    options={regionList}
                    value={value.region_code}
                    onSelect={handleRegionSelect}
                    placeholder="Search region..."
                />

                <SearchableSelect
                    label="Province / Independent City"
                    options={provinceList}
                    value={value.province_code}
                    onSelect={handleProvinceSelect}
                    placeholder="Search province..."
                    disabled={!value.region_code}
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SearchableSelect
                    label="City / Municipality"
                    options={cityList}
                    value={value.city_code}
                    onSelect={handleCitySelect}
                    placeholder="Search city or municipality..."
                    disabled={!value.province_code}
                />

                <SearchableSelect
                    label="Barangay"
                    options={barangayList}
                    value={value.barangay_code}
                    onSelect={handleBarangaySelect}
                    placeholder="Search barangay..."
                    disabled={!value.city_code}
                />
            </div>

            <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-[#6E473B] tracking-wide uppercase">
                    Postal Code
                </label>

                <input
                    type="text"
                    inputMode="numeric"
                    value={value.postal_code}
                    onChange={(e) => updateAddress({
                        postal_code: e.target.value.replace(/\D/g, "").slice(0, 4)
                    })}
                    placeholder="e.g. 4102"
                    maxLength={4}
                    className="w-full px-4 py-2.5 bg-[#FCF8EE]/50 border border-[#E6CCA2] rounded-xl text-sm text-[#6E473B] placeholder-[#CBB294] outline-none focus:border-[#C05A11] focus:bg-white transition-all"
                />
            </div>

            <p className="text-[11px] leading-relaxed text-[#A07060]">
                Search and select your official Region, Province, City/Municipality, and Barangay.
            </p>
        </div>
    );
}

export default AddressSelector;