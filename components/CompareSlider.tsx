import { ReactCompareSlider, ReactCompareSliderImage, ReactCompareSliderHandle } from "react-compare-slider";

interface CompareSliderProps {
    beforeSrc: string;
    afterSrc: string;
    beforeLabel?: string;
    afterLabel?: string;
}

export default function CompareSlider({
    beforeSrc,
    afterSrc,
    beforeLabel = "2D Blueprint",
    afterLabel = "3D Render",
}: CompareSliderProps) {
    return (
        <div className="compare-slider">
            <ReactCompareSlider
                handle={
                    <ReactCompareSliderHandle
                        buttonStyle={{
                            background: "#F26B22",
                            border: "none",
                            boxShadow: "0 2px 12px rgba(242,107,34,0.4)",
                            width: 44,
                            height: 44,
                        }}
                        linesStyle={{
                            background: "#F26B22",
                            width: 2,
                        }}
                    />
                }
                itemOne={
                    <div className="compare-slider__pane">
                        <ReactCompareSliderImage src={beforeSrc} alt="Original 2D Blueprint" />
                        <span className="compare-slider__label compare-slider__label--left">{beforeLabel}</span>
                    </div>
                }
                itemTwo={
                    <div className="compare-slider__pane">
                        <ReactCompareSliderImage src={afterSrc} alt="Generated 3D Render" />
                        <span className="compare-slider__label compare-slider__label--right">{afterLabel}</span>
                    </div>
                }
                style={{ width: "100%", height: "100%", borderRadius: "1rem" }}
            />
        </div>
    );
}
