import React, {Component, ReactElement} from "react";
import {Background} from "../../components/Background/Background";
import OnBoardModal from "./OnBoardModal";
import SigningKey from "./SigningKey/SigningKey";
import SigningKeyImport from "./SigningKey/SigningKeyImport";
import WithdrawalKeyImport from "./WithdrawalKey/WithdrawalKeyImport";
import {OnBoardingRoutes} from "../../constants/routes";

export default class OnboardContainer extends Component<{ history: any, match: any }, {}> {

    private Steper = {
        [OnBoardingRoutes.SIGNING]: <SigningKey />,
        [OnBoardingRoutes.SIGNING_IMPORT]: <SigningKeyImport history={this.props.history} />,
        [OnBoardingRoutes.WITHDRAWAL_IMPORT]: <WithdrawalKeyImport history={this.props.history} />
    };


    public render(): ReactElement {
        const {step} = this.props.match.params;
        return (
            <Background>
                <OnBoardModal history={this.props.history} currentStep={parseInt(step.split("_")[0])}>
                    {this.renderStep()}
                </OnBoardModal>
            </Background>
        );
    }

    private renderStep = (): any => {
        const {step} = this.props.match.params;
        return (this.Steper as any)[step];
    };
}
