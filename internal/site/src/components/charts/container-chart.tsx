// import Spinner from '../spinner'
import { useStore } from "@nanostores/react"
import { memo, useMemo } from "react"
import { Area, AreaChart, CartesianGrid, YAxis } from "recharts"
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
	pinnedAxisDomain,
	xAxis,
} from "@/components/ui/chart"
import { ChartType, Unit } from "@/lib/enums"
import { $containerFilter, $userSettings } from "@/lib/stores"
import { chartMargin, cn, decimalString, formatBytes, formatShortDate, toFixedFloat } from "@/lib/utils"
import type { ChartData } from "@/types"
import { Separator } from "../ui/separator"
import { useYAxisWidth } from "./hooks"

export default memo(function ContainerChart({
	dataKey,
	chartData,
	chartType,
	chartConfig,
	unit = "%",
}: {
	dataKey: string
	chartData: ChartData
	chartType: ChartType
	chartConfig: ChartConfig
	unit?: string
}) {
	const filter = useStore($containerFilter)
	const userSettings = useStore($userSettings)
	const { yAxisWidth, updateYAxisWidth } = useYAxisWidth()

	const { containerData } = chartData

	const isNetChart = chartType === ChartType.Network
	const isDiskChart = chartType === ChartType.Disk

	// Filter with set lookup
	const filteredKeys = useMemo(() => {
		if (!filter) {
			return new Set<string>()
		}
		const filterTerms = filter
			.toLowerCase()
			.split(" ")
			.filter((term) => term.length > 0)
		return new Set(
			Object.keys(chartConfig).filter((key) => {
				const keyLower = key.toLowerCase()
				return !filterTerms.some((term) => keyLower.includes(term))
			})
		)
	}, [chartConfig, filter])

	// biome-ignore lint/correctness/useExhaustiveDependencies: not necessary
	const { toolTipFormatter, dataFunction, tickFormatter } = useMemo(() => {
		const obj = {} as {
			toolTipFormatter: (item: any, key: string) => React.ReactNode | string
			dataFunction: (key: string, data: any) => number | null
			tickFormatter: (value: any) => string
		}
		// tick formatter
		if (chartType === ChartType.CPU) {
			obj.tickFormatter = (value) => {
				const val = `${toFixedFloat(value, 2)}%`
				return updateYAxisWidth(val)
			}
		} else {
			const chartUnit = isNetChart ? userSettings.unitNet : isDiskChart ? userSettings.unitDisk : Unit.Bytes
			obj.tickFormatter = (val) => {
				const { value, unit } = formatBytes(val, isNetChart || isDiskChart, chartUnit, !isNetChart && !isDiskChart)
				return updateYAxisWidth(`${toFixedFloat(value, value >= 10 ? 0 : 1)} ${unit}`)
			}
		}
		// tooltip formatter
		if (isNetChart) {
			const getRxTxBytes = (record?: { b?: [number, number]; ns?: number; nr?: number }) => {
				if (record?.b?.length && record.b.length >= 2) {
					return [Number(record.b[0]) || 0, Number(record.b[1]) || 0]
				}
				return [(record?.ns ?? 0) * 1024 * 1024, (record?.nr ?? 0) * 1024 * 1024]
			}
			const formatRxTx = (recv: number, sent: number) => {
				const { value: receivedValue, unit: receivedUnit } = formatBytes(recv, true, userSettings.unitNet, false)
				const { value: sentValue, unit: sentUnit } = formatBytes(sent, true, userSettings.unitNet, false)
				return (
					<span className="flex">
						{decimalString(receivedValue)} {receivedUnit}
						<span className="opacity-70 ms-0.5"> rx </span>
						<Separator orientation="vertical" className="h-3 mx-1.5 bg-primary/40" />
						{decimalString(sentValue)} {sentUnit}
						<span className="opacity-70 ms-0.5"> tx</span>
					</span>
				)
			}
			obj.toolTipFormatter = (item: any, key: string) => {
				try {
					if (key === "__total__") {
						let totalSent = 0
						let totalRecv = 0
						const payloadData = item?.payload && typeof item.payload === "object" ? item.payload : {}
						for (const [containerKey, value] of Object.entries(payloadData)) {
							if (!value || typeof value !== "object") {
								continue
							}
							// Skip filtered out containers
							if (filteredKeys.has(containerKey)) {
								continue
							}
							const [sent, recv] = getRxTxBytes(value as { b?: [number, number]; ns?: number; nr?: number })
							totalSent += sent
							totalRecv += recv
						}
						return formatRxTx(totalRecv, totalSent)
					}
					const [sent, recv] = getRxTxBytes(item?.payload?.[key])
					return formatRxTx(recv, sent)
				} catch (e) {
					return null
				}
			}
		} else if (isDiskChart) {
			const getReadWriteBytes = (record?: { d?: [number, number] }) => {
				if (record?.d?.length && record.d.length >= 2) {
					return [Number(record.d[0]) || 0, Number(record.d[1]) || 0]
				}
				return [0, 0]
			}
			const formatReadWrite = (read: number, write: number) => {
				const { value: readValue, unit: readUnit } = formatBytes(read, true, userSettings.unitDisk, false)
				const { value: writeValue, unit: writeUnit } = formatBytes(write, true, userSettings.unitDisk, false)
				return (
					<span className="flex">
						{decimalString(readValue)} {readUnit}
						<span className="opacity-70 ms-0.5"> read </span>
						<Separator orientation="vertical" className="h-3 mx-1.5 bg-primary/40" />
						{decimalString(writeValue)} {writeUnit}
						<span className="opacity-70 ms-0.5"> write</span>
					</span>
				)
			}
			obj.toolTipFormatter = (item: any, key: string) => {
				try {
					if (key === "__total__") {
						let totalRead = 0
						let totalWrite = 0
						const payloadData = item?.payload && typeof item.payload === "object" ? item.payload : {}
						for (const [containerKey, value] of Object.entries(payloadData)) {
							if (!value || typeof value !== "object") {
								continue
							}
							if (filteredKeys.has(containerKey)) {
								continue
							}
							const [read, write] = getReadWriteBytes(value as { d?: [number, number] })
							totalRead += read
							totalWrite += write
						}
						return formatReadWrite(totalRead, totalWrite)
					}
					const [read, write] = getReadWriteBytes(item?.payload?.[key])
					return formatReadWrite(read, write)
				} catch (e) {
					return null
				}
			}
		} else if (chartType === ChartType.Memory) {
			obj.toolTipFormatter = (item: any) => {
				const { value, unit } = formatBytes(item.value, false, Unit.Bytes, true)
				return `${decimalString(value)} ${unit}`
			}
		} else {
			obj.toolTipFormatter = (item: any) => `${decimalString(item.value)}${unit}`
		}
		// data function
		if (isNetChart) {
			obj.dataFunction = (key: string, data: any) => {
				const payload = data[key]
				if (!payload) {
					return null
				}
				const sent = payload?.b?.[0] ?? (payload?.ns ?? 0) * 1024 * 1024
				const recv = payload?.b?.[1] ?? (payload?.nr ?? 0) * 1024 * 1024
				return sent + recv
			}
		} else if (isDiskChart) {
			obj.dataFunction = (key: string, data: any) => {
				const payload = data[key]
				if (!payload) {
					return null
				}
				// Use 0 when d is missing (omitzero when [0,0]) so chart is continuous and all containers show
				const read = payload.d?.[0] ?? 0
				const write = payload.d?.[1] ?? 0
				return read + write
			}
		} else {
			obj.dataFunction = (key: string, data: any) => data[key]?.[dataKey] ?? null
		}
		return obj
	}, [filteredKeys])

	// console.log('rendered at', new Date())

	if (containerData.length === 0) {
		return null
	}

	return (
		<div>
			<ChartContainer
				className={cn("h-full w-full absolute aspect-auto bg-card opacity-0 transition-opacity", {
					"opacity-100": yAxisWidth,
				})}
			>
				<AreaChart
					accessibilityLayer
					// syncId={'cpu'}
					data={containerData}
					margin={chartMargin}
					reverseStackOrder={true}
				>
					<CartesianGrid vertical={false} />
					<YAxis
						direction="ltr"
						domain={pinnedAxisDomain()}
						orientation={chartData.orientation}
						className="tracking-tighter"
						width={yAxisWidth}
						tickFormatter={tickFormatter}
						tickLine={false}
						axisLine={false}
					/>
					{xAxis(chartData)}
					<ChartTooltip
						animationEasing="ease-out"
						animationDuration={150}
						truncate={true}
						labelFormatter={(_, data) => formatShortDate(data[0].payload.created)}
						// @ts-expect-error
						itemSorter={(a, b) => b.value - a.value}
						content={<ChartTooltipContent filter={filter} contentFormatter={toolTipFormatter} showTotal={true} />}
					/>
					{Object.keys(chartConfig).map((key) => {
						const filtered = filteredKeys.has(key)
						const fillOpacity = filtered ? 0.05 : 0.4
						const strokeOpacity = filtered ? 0.1 : 1
						return (
							<Area
								key={key}
								isAnimationActive={false}
								dataKey={dataFunction.bind(null, key)}
								name={key}
								type="monotoneX"
								fill={chartConfig[key].color}
								fillOpacity={fillOpacity}
								stroke={chartConfig[key].color}
								strokeOpacity={strokeOpacity}
								activeDot={{ opacity: filtered ? 0 : 1 }}
								stackId="a"
							/>
						)
					})}
				</AreaChart>
			</ChartContainer>
		</div>
	)
})
