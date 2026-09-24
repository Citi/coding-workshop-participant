import { listBuildings, listFloors, listSeats } from '../services/locationService'
import useApiData from './useApiData'

/**
 * The Building -> Floor -> Seat lists for a location form. Floors load once a building is
 * chosen and seats once a floor is chosen.
 * @param {{building_id: string, floor_id: string}} values the chosen ids ('' = none)
 */
export default function useLocationOptions({ building_id: buildingId, floor_id: floorId }) {
  const buildings = useApiData(listBuildings)
  const floors = useApiData(listFloors, { buildingId }, { skip: !buildingId })
  const seats = useApiData(listSeats, { floorId }, { skip: !floorId })
  return { buildings, floors, seats }
}

/**
 * The chosen location in words, e.g. "Building A · Floor 3 · Seat 301", from the lists
 * already loaded. Levels not chosen (or not loaded yet) are left out; '' if none.
 * @param {{building_id: string, floor_id: string, seat_id: string}} values
 * @param {{buildings: {data?: object[]}, floors: {data?: object[]}, seats: {data?: object[]}}} locations
 * @returns {string}
 */
export function describeLocation(values, { buildings, floors, seats }) {
  const find = (list, key, id) => (id ? list?.find((item) => String(item[key]) === String(id)) : undefined)
  const building = find(buildings.data, 'building_id', values.building_id)
  const floor = find(floors.data, 'floor_id', values.floor_id)
  const seat = find(seats.data, 'seat_id', values.seat_id)
  return [building?.building_name, floor && `Floor ${floor.floor_number}`, seat && `Seat ${seat.seat_number}`]
    .filter(Boolean)
    .join(' · ')
}
